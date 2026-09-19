(function (root, factory) {
  "use strict";
  var model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.AdminStudyModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY = 86400000;
  var KST = 9 * 60 * 60 * 1000;
  var RETRY_SUFFIX = /(?:\s*·\s*오답 재풀이\s*)+$/;
  var CHAPTER_ORDER = ['현대시','고전시가','갈래복합·수필','현대소설','고전산문','극','인문·독서','인문·예술','사회','과학','기술','과학·기술','주제 통합','예술','복합 지문','독서론','미니모의고사 1회','미니모의고사 2회','고전 시가','현대 소설','고전 산문','갈래 복합'];

  function dateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === "0000") {
      throw new Error("날짜를 연-월-일 형식으로 입력해 주세요.");
    }
    var stamp = Date.parse(value + "T00:00:00.000Z");
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) {
      throw new Error("실제로 존재하는 날짜를 입력해 주세요.");
    }
    return stamp;
  }

  function timestamp(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value !== "string" || !value.trim()) return NaN;
    var text = value.trim();
    // Supabase timestamps include an offset; treat older offsetless ISO values as UTC.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) text += "Z";
    return Date.parse(text);
  }

  function kstDate(value) {
    var stamp = timestamp(value);
    if (!Number.isFinite(stamp)) return "";
    var shifted = new Date(stamp + KST);
    if (!Number.isFinite(shifted.getTime())) return "";
    return shifted.toISOString().slice(0, 10);
  }

  function addDays(date, amount) {
    if (!Number.isInteger(amount)) throw new Error("날짜 이동 일수는 정수여야 합니다.");
    var stamp = dateValue(date) + amount * DAY;
    var result = new Date(stamp);
    if (!Number.isFinite(result.getTime()) || result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999) {
      throw new Error("지원하는 날짜 범위를 벗어났습니다.");
    }
    return result.toISOString().slice(0, 10);
  }

  function period(preset, now) {
    var today = kstDate(now === undefined ? new Date() : now);
    if (!today) throw new Error("현재 날짜를 확인할 수 없습니다.");
    var monday = addDays(today, -((new Date(dateValue(today)).getUTCDay() + 6) % 7));
    if (preset === "week") return { start: monday, end: addDays(monday, 6) };
    if (preset === "lastWeek") return { start: addDays(monday, -7), end: addDays(monday, -1) };
    if (preset === "month") {
      var start = today.slice(0, 8) + "01";
      var nextMonth = new Date(dateValue(start));
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      return { start: start, end: new Date(nextMonth.getTime() - DAY).toISOString().slice(0, 10) };
    }
    if (preset === "last30") return { start: addDays(today, -29), end: today };
    throw new Error("조회 기간을 다시 선택해 주세요.");
  }

  function bounds(start, end) {
    var first = dateValue(start), last = dateValue(end);
    if (first > last) throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
    var days = Math.round((last - first) / DAY) + 1;
    if (days > 366) throw new Error("조회 기간은 최대 366일까지 선택할 수 있습니다.");
    return {
      startISO: new Date(first - KST).toISOString(),
      endISO: new Date(last + DAY - KST).toISOString(),
      days: days
    };
  }

  function isRetry(row) {
    return !!row && typeof row.label === "string" && RETRY_SUFFIX.test(row.label);
  }

  function baseLabel(row) {
    row = row || {};
    var label = typeof row.label === "string" ? row.label.replace(RETRY_SUFFIX, "").trim() : "";
    return label || (row.set_code != null && String(row.set_code).trim()) || "이름 없는 세트";
  }

  function nonnegative(value) {
    if (value === null || value === undefined || typeof value === "boolean" || value === "") return 0;
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function scoreOf(row) {
    return Math.min(nonnegative(row.score), nonnegative(row.total));
  }

  function recordedTime(row) {
    var parts = row.part_times;
    if (!parts || typeof parts !== "object" || Array.isArray(parts)) return { minutes: 0, recorded: false };
    var values = Object.keys(parts).map(function (key) { return nonnegative(parts[key]); }).filter(function (n) { return n > 0; });
    return { minutes: values.reduce(function (sum, n) { return sum + n; }, 0), recorded: values.length > 0 };
  }

  function roundMinutes(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function wrongQuestions(row) {
    if (!Array.isArray(row.wrong_questions)) return null;
    return Array.from(new Set(row.wrong_questions.map(Number).filter(function (n) { return Number.isInteger(n) && n > 0; })))
      .sort(function (a, b) { return a - b; });
  }

  function summarize(input, start, end, now) {
    var range = bounds(start, end);
    var firstStamp = Date.parse(range.startISO), endStamp = Date.parse(range.endISO);
    var rows = (Array.isArray(input) ? input : []).filter(function (row) {
      if (!row || typeof row !== "object") return false;
      var stamp = timestamp(row.created_at);
      return Number.isFinite(stamp) && stamp >= firstStamp && stamp < endStamp;
    }).slice().sort(function (a, b) {
      return timestamp(a.created_at) - timestamp(b.created_at);
    });
    var firstRows = [], retryRows = [], daysByDate = new Map(), groupsByKey = new Map();
    var firstTotal = 0, firstScore = 0, recordedMinutes = 0, timedCount = 0;
    for (var i = 0; i < range.days; i++) {
      var date = addDays(start, i);
      daysByDate.set(date, { date: date, firstCount: 0, retryCount: 0, total: 0, score: 0, minutes: 0, rows: [] });
    }
    rows.forEach(function (row) {
      var retry = isRetry(row), label = baseLabel(row);
      var key = JSON.stringify([label, row.set_code == null ? "" : String(row.set_code)]);
      var group = groupsByKey.get(key);
      if (!group) {
        group = { label: label, firstCount: 0, retryCount: 0, total: 0, score: 0, latest: null, rows: [], wrongQuestions: [], wrongKnown: false };
        groupsByKey.set(key, group);
      }
      var daily = daysByDate.get(kstDate(row.created_at));
      daily.rows.push(row);
      group.rows.push(row);
      group.latest = row;
      var wrong = wrongQuestions(row);
      // Missing latest data is unknown, never an older wrong list or evidence of mastery.
      group.wrongKnown = wrong !== null;
      group.wrongQuestions = wrong || [];
      if (retry) {
        retryRows.push(row);
        daily.retryCount++;
        group.retryCount++;
      } else {
        firstRows.push(row);
        var total = nonnegative(row.total), score = scoreOf(row);
        firstTotal += total;
        firstScore += score;
        daily.firstCount++;
        daily.total += total;
        daily.score += score;
        group.firstCount++;
        group.total += total;
        group.score += score;
      }
      var timing = recordedTime(row);
      if (timing.recorded) timedCount++;
      recordedMinutes += timing.minutes;
      daily.minutes += timing.minutes;
    });
    var daily = Array.from(daysByDate.values());
    daily.forEach(function (day) { day.minutes = roundMinutes(day.minutes); });
    var groups = Array.from(groupsByKey.values()).sort(function (a, b) {
      return timestamp(b.latest.created_at) - timestamp(a.latest.created_at);
    });
    return {
      rows: rows,
      firstRows: firstRows,
      retryRows: retryRows,
      firstCount: firstRows.length,
      retryCount: retryRows.length,
      firstTotal: firstTotal,
      firstScore: firstScore,
      accuracy: firstTotal > 0 ? Math.round(firstScore / firstTotal * 100) : null,
      activeDays: daily.filter(function (day) { return day.rows.length > 0; }).length,
      recordedMinutes: roundMinutes(recordedMinutes),
      timedCount: timedCount,
      daily: daily,
      groups: groups,
      remainingWrong: groups.reduce(function (sum, group) { return sum + (group.wrongKnown ? group.wrongQuestions.length : 0); }, 0),
      unknownWrongGroups: groups.filter(function (group) { return !group.wrongKnown; }).length
    };
  }

  function wrongCount(row) {
    if (!row || typeof row.total !== "number" || typeof row.score !== "number" ||
        !Number.isFinite(row.total) || !Number.isFinite(row.score) || row.total < 0) return null;
    return row.total - Math.min(row.total, Math.max(0, row.score));
  }

  function labelParts(label, catalog) {
    var prefixes = catalog.filter(function (item) {
      return item && typeof item.material === "string" && item.material.trim() &&
        typeof item.chapter === "string" && item.chapter.trim();
    }).map(function (item) {
      var material = item.material.trim(), chapter = item.chapter.trim();
      return { material: material, chapter: chapter, prefix: material + " " + chapter };
    }).filter(function (item) {
      return label === item.prefix || label.indexOf(item.prefix + " ") === 0;
    }).sort(function (a, b) { return b.prefix.length - a.prefix.length; });
    if (prefixes.length) {
      var match = prefixes[0];
      return { material: match.material, chapter: match.chapter, title: label.slice(match.prefix.length).trim() };
    }

    // Old labels may predate the catalog. Only an unambiguous, whole chapter name
    // followed by a numbered set is safe to infer without its original metadata.
    var candidates = [];
    CHAPTER_ORDER.forEach(function (chapter) {
      var from = 0, at;
      while ((at = label.indexOf(chapter, from)) !== -1) {
        var end = at + chapter.length, rest = label.slice(end);
        if ((at === 0 || /\s/.test(label.charAt(at - 1))) && /^\s+\d/.test(rest)) {
          candidates.push({ material: label.slice(0, at).trim() || "기타 교재", chapter: chapter, title: rest.trim() });
        }
        from = end;
      }
    });
    return candidates.length === 1 ? candidates[0] : { material: "기타 교재", chapter: "", title: label };
  }

  function koreanOrder(a, b) {
    return a.localeCompare(b, "ko", { numeric: true });
  }

  function chapterOrder(a, b) {
    var first = CHAPTER_ORDER.indexOf(a), second = CHAPTER_ORDER.indexOf(b);
    if (first !== -1 || second !== -1) {
      if (first === -1) return 1;
      if (second === -1) return -1;
      return first - second;
    }
    return koreanOrder(a, b);
  }

  function homeworkOverview(summaryGroups, catalog) {
    var sections = new Map();
    catalog = Array.isArray(catalog) ? catalog : [];
    (Array.isArray(summaryGroups) ? summaryGroups : []).forEach(function (group) {
      if (!group || !Array.isArray(group.rows)) return;
      var attempts = group.rows.filter(function (row) { return row && typeof row === "object"; }).slice().sort(function (a, b) {
        return timestamp(a.created_at) - timestamp(b.created_at);
      });
      if (!attempts.length) return;
      var first = attempts.find(function (row) { return !isRetry(row); }) || null;
      var latest = attempts[attempts.length - 1];
      var label = typeof group.label === "string" && group.label.trim() ? group.label.trim() : baseLabel(latest);
      var parts = labelParts(label, catalog), key = JSON.stringify([parts.material, parts.chapter]);
      var section = sections.get(key);
      if (!section) {
        section = { material: parts.material, chapter: parts.chapter, sets: [] };
        sections.set(key, section);
      }
      // Each summary group is one distinct set, including groups with equal labels
      // but different set_code values. Do not collapse those when arranging them.
      section.sets.push({
        label: label, title: parts.title, first: first, latest: latest, attempts: attempts,
        initialWrongCount: wrongCount(first), latestWrongCount: wrongCount(latest)
      });
    });
    var result = Array.from(sections.values()).sort(function (a, b) {
      return koreanOrder(a.material, b.material) || chapterOrder(a.chapter, b.chapter);
    });
    result.forEach(function (section) {
      section.sets.sort(function (a, b) { return koreanOrder(a.title, b.title); });
    });
    return result;
  }

  return { kstDate: kstDate, addDays: addDays, period: period, bounds: bounds, isRetry: isRetry, baseLabel: baseLabel, summarize: summarize, homeworkOverview: homeworkOverview };
});
