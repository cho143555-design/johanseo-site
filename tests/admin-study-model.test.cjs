"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const modelPath = path.join(__dirname, "..", "admin-study-model.js");
const model = require(modelPath);

function row(created_at, extras = {}) {
  return { id: created_at, created_at, student_name: "테스트학생", label: "문학 현대시 001~010", set_code: null, total: 10, score: 8, wrong_questions: [3, 7], part_times: null, ...extras };
}

test("KST dates cross midnight independently of UTC and support explicit offsets", () => {
  assert.equal(model.kstDate("2026-09-13T14:59:59.999Z"), "2026-09-13");
  assert.equal(model.kstDate("2026-09-13T15:00:00.000Z"), "2026-09-14");
  assert.equal(model.kstDate("2026-09-14T00:00:00+09:00"), "2026-09-14");
  assert.equal(model.kstDate("2026-09-13 15:00:00"), "2026-09-14");
  assert.equal(model.kstDate("invalid"), "");
  assert.equal(model.kstDate(null), "");
});

test("week presets start Monday and include Sunday around the KST week boundary", () => {
  const monday = new Date("2026-09-13T15:00:00Z");
  assert.deepEqual(model.period("week", monday), { start: "2026-09-14", end: "2026-09-20" });
  assert.deepEqual(model.period("lastWeek", monday), { start: "2026-09-07", end: "2026-09-13" });
  assert.deepEqual(model.period("week", new Date("2026-09-13T14:59:59Z")), { start: "2026-09-07", end: "2026-09-13" });
  assert.deepEqual(model.period("lastWeek", new Date("2026-01-01T00:00:00Z")), { start: "2025-12-22", end: "2025-12-28" });
  assert.deepEqual(model.period("month", new Date("2024-02-20T00:00:00Z")), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(model.period("last30", new Date("2026-03-01T00:00:00Z")), { start: "2026-01-31", end: "2026-03-01" });
  assert.equal(model.addDays("2024-02-28", 1), "2024-02-29");
});

test("inclusive date bounds translate to exclusive next-day KST endpoint", () => {
  assert.deepEqual(model.bounds("2026-09-14", "2026-09-20"), {
    startISO: "2026-09-13T15:00:00.000Z", endISO: "2026-09-20T15:00:00.000Z", days: 7
  });
  const rows = [row("2026-09-13T14:59:59.999Z"), row("2026-09-13T15:00:00Z"), row("2026-09-20T14:59:59.999Z"), row("2026-09-20T15:00:00Z")];
  const summary = model.summarize(rows, "2026-09-14", "2026-09-20");
  assert.equal(summary.rows.length, 2);
  assert.equal(summary.daily[0].rows.length, 1);
  assert.equal(summary.daily[6].rows.length, 1);
  assert.equal(summary.activeDays, 2);
});

test("empty periods retain zero-filled dates and no invented accuracy or time", () => {
  const summary = model.summarize([], "2026-09-14", "2026-09-20");
  assert.deepEqual({ firstCount: summary.firstCount, retryCount: summary.retryCount, firstTotal: summary.firstTotal, firstScore: summary.firstScore, accuracy: summary.accuracy, activeDays: summary.activeDays, recordedMinutes: summary.recordedMinutes, timedCount: summary.timedCount, remainingWrong: summary.remainingWrong }, { firstCount: 0, retryCount: 0, firstTotal: 0, firstScore: 0, accuracy: null, activeDays: 0, recordedMinutes: 0, timedCount: 0, remainingWrong: 0 });
  assert.equal(summary.daily.length, 7);
  assert.equal(summary.groups.length, 0);
  assert.ok(summary.daily.every(day => day.total === 0 && day.rows.length === 0));
});

test("accuracy is weighted by normal graded questions and excludes retry attempts", () => {
  const first = row("2026-09-14T02:00:00Z", { total: 20, score: 10 });
  const second = row("2026-09-14T03:00:00Z", { total: 5, score: 5 });
  const retry = row("2026-09-14T04:00:00Z", { label: first.label + " · 오답 재풀이", total: 2, score: 2, wrong_questions: [] });
  const input = Object.freeze([Object.freeze(retry), Object.freeze(second), Object.freeze(first)]);
  const summary = model.summarize(input, "2026-09-14", "2026-09-20");
  assert.equal(summary.firstCount, 2);
  assert.equal(summary.retryCount, 1);
  assert.equal(summary.firstTotal, 25);
  assert.equal(summary.firstScore, 15);
  assert.equal(summary.accuracy, 60);
  assert.deepEqual(summary.rows, [first, second, retry]);
  assert.deepEqual(summary.firstRows, [first, second]);
  assert.deepEqual(summary.retryRows, [retry]);
  assert.equal(summary.daily[0].total, 25);
  assert.equal(summary.daily[0].score, 15);
  assert.equal(summary.groups[0].total, 25);
  assert.equal(summary.groups[0].latest, retry);
});

test("repeated retry suffixes group with their normal label but set codes keep collisions separate", () => {
  const label = "2028 이감으로 기출 문학 현대시 01 · 2027 6모";
  const normal = row("2026-09-14T01:00:00Z", { label, set_code: "hw-1", wrong_questions: [3, 7, 9] });
  const retry = row("2026-09-15T01:00:00Z", { label: label + " · 오답 재풀이 · 오답 재풀이", set_code: "hw-1", total: 3, score: 2, wrong_questions: [7], answers: [1, 3, 4] });
  const different = row("2026-09-16T01:00:00Z", { label, set_code: "hw-2", wrong_questions: [8, 8] });
  assert.equal(model.isRetry(retry), true);
  assert.equal(model.baseLabel(retry), label);
  assert.equal(model.baseLabel({ label: "", set_code: "custom-1" }), "custom-1");
  assert.equal(model.baseLabel({}), "이름 없는 세트");
  const summary = model.summarize([normal, retry, different], "2026-09-14", "2026-09-20");
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.groups[0].latest, different);
  assert.deepEqual(summary.groups[0].wrongQuestions, [8]);
  assert.deepEqual(summary.groups[1].wrongQuestions, [7]);
  assert.equal(summary.remainingWrong, 2);
  assert.equal(summary.unknownWrongGroups, 0);
  assert.equal(summary.groups[1].firstCount, 1);
  assert.equal(summary.groups[1].retryCount, 1);
});

test("missing latest wrong data is unknown and never guesses question IDs from answers", () => {
  const before = row("2026-09-13T14:59:00Z", { wrong_questions: [99] });
  const first = row("2026-09-14T01:00:00Z", { wrong_questions: [13, 47], answers: [1, 2, 3] });
  const retry = row("2026-09-15T01:00:00Z", { label: first.label + " · 오답 재풀이", total: 2, score: 1, wrong_questions: [47], answers: [5, 2] });
  const missing = row("2026-09-16T01:00:00Z", { label: first.label + " · 오답 재풀이", wrong_questions: null, answers: [47] });
  const summary = model.summarize([before, first, retry, missing], "2026-09-14", "2026-09-20");
  assert.deepEqual(summary.groups[0].wrongQuestions, []);
  assert.equal(summary.groups[0].wrongKnown, false);
  assert.equal(summary.remainingWrong, 0);
  assert.equal(summary.unknownWrongGroups, 1);
  const onlyRetry = model.summarize([retry], "2026-09-14", "2026-09-20");
  assert.equal(onlyRetry.accuracy, null);
  assert.equal(onlyRetry.firstCount, 0);
  assert.equal(onlyRetry.groups[0].wrongKnown, true);
  assert.deepEqual(onlyRetry.groups[0].wrongQuestions, [47]);
  assert.equal(onlyRetry.remainingWrong, 1);
  assert.equal(onlyRetry.unknownWrongGroups, 0);
  const clear = model.summarize([first, row("2026-09-16T02:00:00Z", { wrong_questions: [] })], "2026-09-14", "2026-09-20");
  assert.equal(clear.groups[0].wrongKnown, true);
  assert.deepEqual(clear.groups[0].wrongQuestions, []);
  assert.equal(clear.remainingWrong, 0);
  assert.equal(clear.unknownWrongGroups, 0);
});

test("recorded minutes sum only meaningful positive part times; null does not mean zero-time study", () => {
  const rows = [
    row("2026-09-14T01:00:00Z", { part_times: { 독서: 25.5, 문학: 20, 언매: "12.5" } }),
    row("2026-09-15T01:00:00Z", { part_times: null }),
    row("2026-09-16T01:00:00Z", { part_times: { 독서: null, 문학: "", 언매: -2, 기타: "invalid", 없는것: false } }),
    row("2026-09-17T01:00:00Z", { part_times: { 독서: 0.1, 문학: 0.2 } })
  ];
  const summary = model.summarize(rows, "2026-09-14", "2026-09-20");
  assert.equal(summary.recordedMinutes, 58.3);
  assert.equal(summary.timedCount, 2);
  assert.equal(summary.daily[0].minutes, 58);
  assert.equal(summary.daily[3].minutes, 0.3);
});

test("invalid, reversed, and overly long periods reject with understandable errors", () => {
  for (const date of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-09-00", "2026-9-01", "0000-01-01", "bad", null]) {
    assert.throws(() => model.bounds(date, "2026-09-20"), /날짜/);
  }
  assert.throws(() => model.bounds("2026-09-20", "2026-09-14"), /시작일/);
  assert.throws(() => model.bounds("2024-01-01", "2025-01-01"), /366/);
  assert.equal(model.bounds("2024-01-01", "2024-12-31").days, 366);
  assert.throws(() => model.period("bad"), /조회 기간/);
  assert.throws(() => model.addDays("2026-09-14", 0.5), /정수/);
  assert.equal(model.summarize([row("invalid"), null], "2026-09-14", "2026-09-14").rows.length, 0);
});

test("the model exports to a browser global without CommonJS", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(modelPath, "utf8"), context);
  assert.equal(typeof context.AdminStudyModel.summarize, "function");
  assert.equal(context.AdminStudyModel.kstDate("2026-09-13T15:00:00Z"), "2026-09-14");
});

test("all period math and timestamp grouping stay identical in different host timezones", () => {
  const script = `const m=require(${JSON.stringify(modelPath)});process.stdout.write(JSON.stringify({week:m.period('week',new Date('2026-09-13T15:00:00Z')),month:m.period('month',new Date('2026-03-31T16:00:00Z')),offsetless:m.kstDate('2026-09-13T15:00:00'),bounds:m.bounds('2026-03-01','2026-03-31')}));`;
  const results = ["UTC", "America/Los_Angeles", "Asia/Seoul", "Pacific/Auckland"].map(TZ => execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.ok(results.every(value => value === results[0]));
});

function homework(rows, catalog = []) {
  return model.homeworkOverview(model.summarize(rows, "2026-09-14", "2026-09-20").groups, catalog);
}

test("homework keeps the period's first wrong count after a successful retry", () => {
  const label = "테스트 교재 현대시 03 · 테스트 작품";
  const first = row("2026-09-14T01:00:00Z", { label, total: 4, score: 3, wrong_questions: [2] });
  const retry = row("2026-09-15T01:00:00Z", { label: label + " · 오답 재풀이", total: 1, score: 1, wrong_questions: [] });
  assert.deepEqual(homework([retry, first]), [{
    material: "테스트 교재", chapter: "현대시", sets: [{
      label, title: "03 · 테스트 작품", first, latest: retry, attempts: [first, retry], initialWrongCount: 1, latestWrongCount: 0
    }]
  }]);
});

test("repeated ordinary submissions preserve the earliest ordinary result", () => {
  const label = "테스트 교재 현대시 04";
  const first = row("2026-09-14T01:00:00Z", { label, total: 3, score: 1 });
  const second = row("2026-09-15T01:00:00Z", { label, total: 3, score: 2 });
  const retry = row("2026-09-16T01:00:00Z", { label: label + " · 오답 재풀이", total: 1, score: 1 });
  const set = homework([retry, second, first])[0].sets[0];
  assert.equal(set.first, first);
  assert.equal(set.initialWrongCount, 2);
  assert.equal(set.latestWrongCount, 0);
  assert.deepEqual(set.attempts, [first, second, retry]);
});

test("a retry-only period leaves initial result unknown even with an earlier submission outside it", () => {
  const label = "테스트 교재 현대시 03";
  const before = row("2026-09-13T01:00:00Z", { label, total: 3, score: 1 });
  const retry = row("2026-09-14T01:00:00Z", { label: label + " · 오답 재풀이", total: 2, score: 2 });
  const set = homework([before, retry])[0].sets[0];
  assert.equal(set.first, null);
  assert.equal(set.initialWrongCount, null);
  assert.equal(set.latestWrongCount, 0);
  assert.deepEqual(set.attempts, [retry]);
});

test("homework sorts numbered sets naturally and keeps different codes with the same label", () => {
  const rows = ["10", "04", "03", "3"].map((title, i) => row(`2026-09-14T0${i}:00:00Z`, { label: "테스트 교재 현대시 " + title, set_code: "set-" + i }));
  rows.push(row("2026-09-14T05:00:00Z", { label: "테스트 교재 현대시 03", set_code: "distinct-code" }));
  const sets = homework(rows)[0].sets;
  assert.deepEqual(sets.map(set => set.title), ["03", "3", "03", "04", "10"]);
  assert.equal(sets.length, 5);
  assert.equal(new Set(sets.map(set => set.first.set_code)).size, 5);
});

test("catalog uses the longest material/chapter prefix and preserves the complete remaining title", () => {
  const catalog = [{ material: "테스트", chapter: "교재" }, { material: "테스트 교재", chapter: "현대시" }];
  const label = "테스트 교재 현대시 03 · 사회 04와 관련된 작품";
  const section = homework([row("2026-09-14T01:00:00Z", { label })], catalog)[0];
  assert.equal(section.material, "테스트 교재");
  assert.equal(section.chapter, "현대시");
  assert.equal(section.sets[0].title, "03 · 사회 04와 관련된 작품");
});

test("fallback recognizes only an unambiguous numbered chapter and otherwise preserves the full label", () => {
  const labels = ["테스트 교재 현대시 03 사회 04", "테스트 교재 사회문화 03", "독서 숙제", "테스트 교재 현대시 작품명"];
  const fallback = homework(labels.map((label, i) => row(`2026-09-14T0${i}:00:00Z`, { label })));
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].material, "기타 교재");
  assert.equal(fallback[0].chapter, "");
  assert.deepEqual(new Set(fallback[0].sets.map(set => set.title)), new Set(labels));
  const known = homework([row("2026-09-14T01:00:00Z", { label: "테스트 교재 현대 소설 04 · 작품명" })])[0];
  assert.equal(known.chapter, "현대 소설");
  assert.equal(known.sets[0].title, "04 · 작품명");
});

test("homework sections use material names then the existing curriculum chapter order", () => {
  const labels = ["나 교재 현대시 03", "가 교재 현대 소설 01", "가 교재 사회 01", "가 교재 현대시 04", "가 교재 고전시가 02"];
  const sections = homework(labels.map((label, i) => row(`2026-09-14T0${i}:00:00Z`, { label })));
  assert.deepEqual(sections.map(section => [section.material, section.chapter]), [
    ["가 교재", "현대시"], ["가 교재", "고전시가"], ["가 교재", "사회"], ["가 교재", "현대 소설"], ["나 교재", "현대시"]
  ]);
});

test("wrong counts require finite numeric grade fields and clamp scores within the total", () => {
  const grades = [
    { total: 4, score: 3, expected: 1 }, { total: 4, score: 10, expected: 0 }, { total: 4, score: -2, expected: 4 },
    { total: 0, score: 0, expected: 0 }, { total: null, score: 0, expected: null }, { total: 4, score: null, expected: null },
    { total: "4", score: 3, expected: null }, { total: 4, score: "3", expected: null }, { total: -1, score: 0, expected: null },
    { total: 4, score: NaN, expected: null }, { total: Infinity, score: 3, expected: null }, { total: 4, score: false, expected: null }
  ];
  grades.forEach(({ total, score, expected }) => {
    const set = homework([row("2026-09-14T01:00:00Z", { total, score, wrong_questions: [] })])[0].sets[0];
    assert.equal(set.initialWrongCount, expected);
    assert.equal(set.latestWrongCount, expected);
  });
});

test("homework overview does not reorder or mutate its summary groups, rows, or catalog", () => {
  const first = Object.freeze(row("2026-09-14T01:00:00Z", { label: "테스트 교재 현대시 03" }));
  const retry = Object.freeze(row("2026-09-15T01:00:00Z", { label: first.label + " · 오답 재풀이" }));
  const rows = Object.freeze([retry, first]);
  const groups = Object.freeze([Object.freeze({ label: first.label, rows })]);
  const catalog = Object.freeze([Object.freeze({ material: "테스트 교재", chapter: "현대시" })]);
  const set = model.homeworkOverview(groups, catalog)[0].sets[0];
  assert.deepEqual(rows, [retry, first]);
  assert.deepEqual(set.attempts, [first, retry]);
  assert.notEqual(set.attempts, rows);
  assert.equal(set.first, first);
  assert.equal(set.latest, retry);
  assert.deepEqual(model.homeworkOverview([]), []);
});
