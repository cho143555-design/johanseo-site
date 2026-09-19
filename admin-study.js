/* Read-only period dashboard. Existing Supabase session and policies are reused. */
(function () {
  'use strict';
  const M = window.AdminStudyModel;
  const el = id => document.getElementById(id);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number(value || 0).toLocaleString('ko-KR');
  const dateText = date => `${Number(date.slice(5,7))}.${Number(date.slice(8,10))}`;
  const weekday = date => ['일','월','화','수','목','금','토'][new Date(`${date}T12:00:00+09:00`).getUTCDay()];
  const timeText = value => new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  let db, catalog = [], initialized = false, generation = 0, report, historyFilter = 'all', historyLimit = 30;

  async function allRows(table, columns, filter) {
    const rows = [], size = 500;
    for (let offset = 0; ; offset += size) {
      let q = db.from(table).select(columns);
      if (filter) q = filter(q);
      const {data,error} = await q.order('created_at', {ascending:true}).order('id', {ascending:true}).range(offset,offset+size-1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('기록을 받지 못했습니다.');
      rows.push(...data);
      if (data.length < size) return rows;
    }
  }

  function setStatus(text, error) {
    el('studyStatus').textContent = text;
    el('studyStatus').classList.toggle('error', !!error);
  }

  function setPreset(preset) {
    const dates = M.period(preset);
    el('studyStart').value = dates.start;
    el('studyEnd').value = dates.end;
    document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.period === preset)));
  }

  function clearReport() {
    generation++;
    report = null;
    el('studyResults').innerHTML = '';
    el('studyResults').removeAttribute('aria-busy');
    el('studyLoad').disabled = false;
    el('studyLoad').textContent = '조회';
  }

  async function load() {
    clearReport();
    const ticket = generation;
    const name = el('studyStudent').value;
    if (!name) { setStatus('학생을 선택하면 기간별 학습 기록을 볼 수 있어요.'); return; }
    const start = el('studyStart').value, end = el('studyEnd').value;
    let bounds;
    try { bounds = M.bounds(start,end); }
    catch (error) { setStatus(error.message,true); return; }
    el('studyLoad').disabled = true;
    el('studyLoad').textContent = '불러오는 중';
    el('studyResults').setAttribute('aria-busy','true');
    setStatus(`${name}의 ${dateText(start)}–${dateText(end)} 기록을 불러오고 있어요.`);
    const filter = q => q.eq('student_name',name).gte('created_at',bounds.startISO).lt('created_at',bounds.endISO);
    const results = await Promise.allSettled([
      allRows('submissions','id,student_name,label,set_code,score,total,wrong_questions,wrong_detail,part_times,created_at',filter),
      allRows('questions','id,student_name,label,question,answered,created_at',filter),
      allRows('review_notes','id,student_name,source_label,material,chapter,section,question_no,note,resolved,created_at',filter)
    ]);
    if (ticket !== generation) return;
    el('studyLoad').disabled = false;
    el('studyLoad').textContent = '조회';
    el('studyResults').removeAttribute('aria-busy');
    if (results[0].status !== 'fulfilled') {
      setStatus('학습 기록을 불러오지 못했어요. 연결 상태를 확인한 뒤 다시 조회해 주세요.',true);
      return;
    }
    report = {name,start,end,summary:M.summarize(results[0].value,start,end),questions:results[1],notes:results[2]};
    historyFilter = 'all'; historyLimit = 30;
    try { localStorage.setItem('admin_study_student',name); } catch (_) { /* Optional preference only. */ }
    render();
    const partial = results.slice(1).some(r => r.status === 'rejected');
    setStatus(partial ? '채점 기록을 불러왔어요. 불러오지 못한 보조 항목은 아래에 따로 표시했어요.' : `조회 완료 · 채점 ${num(report.summary.rows.length)}회 · 방금 조회한 기록 기준`);
  }

  function metric(title,value,unit,detail,accent) {
    return `<div class="study-metric${accent?' accent':''}"><dt>${title}</dt><dd>${value}<small>${unit}</small></dd><p>${detail}</p></div>`;
  }

  function renderCalendar(summary) {
    const today = M.kstDate(new Date());
    const max = Math.max(1,...summary.daily.map(d=>d.total));
    if (summary.daily.length <= 7) return `<div class="study-calendar">${summary.daily.map(d=>{
      const active = d.firstCount + d.retryCount > 0;
      const future = d.date > today;
      return `<div class="study-day${active?'':' empty'}${future?' future':''}"><time datetime="${d.date}">${dateText(d.date)} ${weekday(d.date)}</time><strong>${active?`${num(d.total)}<small style="display:inline">문항</small>`:future?'예정':'—'}</strong><small>${active?`일반 풀이 ${d.firstCount}회`:future?'아직 오지 않은 날':'채점 기록 없음'}</small>${d.retryCount?`<small class="retry-text">재풀이 ${d.retryCount}회</small>`:'<small aria-hidden="true">&nbsp;</small>'}<div class="study-day-bar"><span style="width:${Math.round(d.total/max*100)}%"></span></div></div>`;
    }).join('')}</div>`;
    return `<div class="study-daily-long" tabindex="0" aria-label="날짜별 학습량">${summary.daily.map(d=>`<div class="study-daily-row"><time datetime="${d.date}">${dateText(d.date)} (${weekday(d.date)})</time><div class="study-day-bar" aria-hidden="true"><span style="width:${Math.round(d.total/max*100)}%"></span></div><span>${num(d.total)}문항 · 재풀이 ${d.retryCount}회</span></div>`).join('')}</div>`;
  }

  function answerText(value) {
    return /^[1-5]$/.test(String(value)) ? ['①','②','③','④','⑤'][Number(value)-1] : escape(value == null?'기록 없음':value);
  }

  function renderAttempt(row, label) {
    const detail = Array.isArray(row.wrong_detail) ? row.wrong_detail : [];
    const numbers = Array.isArray(row.wrong_questions) ? row.wrong_questions : detail.map(d=>d.n);
    const questions = [...new Set(numbers)];
    const total = row.total, score = row.score;
    const gradeKnown = Number.isFinite(total) && Number.isFinite(score) && total>=0 && score>=0 && score<=total;
    const emptyText = !gradeKnown?'채점 정보가 없어 오답 여부를 확인할 수 없어요.':total===0?'채점된 문항이 없어요.':score===total?'틀린 문제 없음':'틀린 문제 번호가 저장되어 있지 않아요.';
    return `<article class="homework-attempt"><div class="homework-attempt-heading"><strong>${label}</strong><span>${dateText(M.kstDate(row.created_at))} ${timeText(row.created_at)} · ${gradeKnown?`${num(score)}/${num(total)} 정답`:'채점 정보 없음'}</span></div>${questions.length?`<table class="homework-answers"><caption class="study-sr-only">${label} 오답 상세</caption><thead><tr><th scope="col">틀린 문제</th><th scope="col">고른 답</th><th scope="col">정답</th></tr></thead><tbody>${questions.map(n=>{const d=detail.find(item=>String(item.n)===String(n));return `<tr><th scope="row">${escape(n)}번</th><td class="homework-picked">${answerText(d?.p)}</td><td>${answerText(d?.a)}</td></tr>`;}).join('')}</tbody></table>`:`<p class="homework-no-wrong">${emptyText}</p>`}</article>`;
  }

  function renderHomework(summary) {
    const sections = M.homeworkOverview(summary.groups,catalog);
    if (!sections.length) return '<p class="study-empty">이 기간에 채점한 숙제가 없어요. 날짜를 바꿔서 확인해 보세요.</p>';
    return `<div class="homework-sections">${sections.map(section=>`<section class="homework-section"><div class="homework-section-heading"><p>${escape(section.material)}</p><h3>${escape(section.chapter || '세트별 기록')} <small>${section.sets.length}세트</small></h3></div><div class="homework-table-head" aria-hidden="true"><span>세트</span><span>처음 오답</span><span>이후 풀이</span><span></span></div>${section.sets.map(set=>{
      const firstIndex = set.first ? set.attempts.indexOf(set.first) : -1;
      const earlier = firstIndex>0 ? set.attempts.slice(0,firstIndex) : [];
      const later = set.first ? set.attempts.slice(firstIndex+1) : set.attempts;
      const latestCount = set.latestWrongCount;
      const afterLabel = !set.first ? '재풀이만 있음' : !later.length ? '—' : `${M.isRetry(set.latest)?'재풀이 후':'최근'} ${latestCount == null?'정보 없음':`${num(latestCount)}개`}`;
      const earlierHtml = earlier.length ? `<details class="homework-later"><summary>이 기간의 앞선 재풀이 ${earlier.length}회 보기</summary>${earlier.map((r,i)=>renderAttempt(r,`앞선 오답 재풀이 ${i+1}`)).join('')}</details>` : '';
      return `<details class="homework-set"><summary aria-label="${escape(section.chapter?section.chapter+' '+set.title:set.label)} · ${set.initialWrongCount == null?'처음 오답 기록 없음':`처음 ${set.initialWrongCount}개 틀림`} · ${afterLabel}"><span class="homework-set-title">${escape(set.title)}${set.first?`<small>${Number.isFinite(set.first.total)?num(set.first.total)+'문항':'문항 수 기록 없음'}</small>`:''}</span><span class="homework-wrong${set.initialWrongCount>0?' has-wrong':''}">${set.initialWrongCount==null?'—':`${num(set.initialWrongCount)}<small>개</small>`}</span><span class="homework-after${later.length && latestCount===0?' cleared':''}">${afterLabel}</span><span class="homework-caret" aria-hidden="true"></span></summary><div class="homework-set-body">${set.first?renderAttempt(set.first,'처음 풀이'):'<p class="homework-period-note">선택한 기간에는 일반 풀이 기록이 없어요. 아래는 재풀이 기록이에요.</p>'}${later.length?`${set.first?`<details class="homework-later"><summary>이후 풀이 ${later.length}회 보기</summary>`:''}${later.map((r,i)=>renderAttempt(r,`${M.isRetry(r)?'오답 재풀이':'다시 일반 풀이'}${later.length>1?' '+(i+1):''}`)).join('')}${set.first?'</details>':''}`:''}${earlierHtml}</div></details>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  function renderNotes(result,kind) {
    const title = kind === 'questions' ? '질문·소감' : '기억해둘 문제';
    if (result.status !== 'fulfilled') return `<div class="study-small-panel"><h3>${title}</h3><p class="study-muted">불러오지 못했어요. 다시 조회해 주세요.</p></div>`;
    const rows = result.value.slice().reverse();
    const cards = rows.map(r => {
      const done = kind === 'questions' ? r.answered : r.resolved;
      const badge = kind === 'questions' ? (done?'답변 완료':'답변 확인 필요') : (done?'복습 완료':'복습 중');
      const label = kind === 'questions' ? r.label : `${r.source_label || [r.material,r.chapter,r.section].filter(Boolean).join(' ')} · ${r.question_no}번`;
      return `<article><span class="study-badge${done?'':' pending'}">${badge}</span><time class="study-muted">${dateText(M.kstDate(r.created_at))}</time><p>${escape(kind === 'questions'?r.question:r.note || '메모 없이 보관한 문항')}</p><p class="study-muted">${escape(label)}</p></article>`;
    });
    return `<div class="study-small-panel"><h3>${title} <span class="study-muted">${rows.length}건</span></h3><p class="study-muted">기간 안에 남긴 기록 · 처리 상태는 현재 기준</p>${cards.length?cards.slice(0,3).join(''):'<p class="study-muted" style="margin-top:12px">이 기간에 남긴 기록이 없어요.</p>'}${cards.length>3?`<details><summary>나머지 ${cards.length-3}건 보기</summary>${cards.slice(3).join('')}</details>`:''}</div>`;
  }

  function render() {
    const {name,start,end,summary:s} = report;
    const last = s.rows[s.rows.length-1];
    el('studyResults').innerHTML = `
      <div class="study-summary-head"><h2>${escape(name)}의 숙제 확인</h2><p>${escape(start.replaceAll('-','.'))} — ${escape(end.replaceAll('-','.'))}</p></div>
      <div class="homework-guide"><strong>${s.groups.length}개 세트</strong><span>세트를 누르면 틀린 문제와 고른 답이 펼쳐져요.</span></div>
      <p class="homework-basis">‘처음 오답’은 선택한 기간의 첫 일반 풀이 기준. 재풀이로 맞혀도 그대로 남아요.</p>
      ${renderHomework(s)}
      <details class="study-secondary"><summary><span>학습 현황도 보기</span><small>공부한 날 · 학습량 · 날짜별 기록</small></summary><div class="study-secondary-body">
      <dl class="study-metrics">
        ${metric('공부한 날',num(s.activeDays),'일',`선택한 ${s.daily.length}일 중 채점한 날`)}
        ${metric('일반 풀이',num(s.firstTotal),'문항',`일반 채점 ${num(s.firstCount)}회`)}
        ${metric('일반 풀이 정답률',s.accuracy == null?'—':s.accuracy,s.accuracy == null?'':'%',`${num(s.firstScore)} / ${num(s.firstTotal)}문항 정답`,true)}
        ${metric('오답 재풀이',num(s.retryCount),'회','일반 풀이 집계에서 제외')}
      </dl>
      <div class="study-insight">${last?`마지막 채점 <b>${dateText(M.kstDate(last.created_at))} ${timeText(last.created_at)}</b> · 세트별 최근 채점에 남은 오답 <b>${num(s.remainingWrong)}문항</b>${s.unknownWrongGroups?` · 오답 정보 없는 세트 ${s.unknownWrongGroups}개`:''}`:'선택한 기간에 제출된 채점 기록이 없어요. 다른 기간도 확인해 보세요.'}</div>
      <div class="study-section"><div class="study-section-title"><h3>날짜별 학습량</h3><p>문항 수는 일반 풀이 기준</p></div>${renderCalendar(s)}</div>
      <div class="study-section study-columns">${renderNotes(report.questions,'questions')}${renderNotes(report.notes,'notes')}</div>
      <div class="study-section"><div class="study-section-title"><h3>풀이 내역</h3><div class="study-filter" role="group" aria-label="풀이 종류"><button type="button" data-history="all" aria-pressed="true">전체 ${s.rows.length}</button><button type="button" data-history="first" aria-pressed="false">일반 풀이 ${s.firstCount}</button><button type="button" data-history="retry" aria-pressed="false">재풀이 ${s.retryCount}</button></div></div><p class="study-muted" style="margin-bottom:8px">내역을 누르면 틀린 문항과 입력된 풀이 시간을 볼 수 있어요.</p><div id="studyHistory"></div></div>
      <div class="study-footnote">일반 풀이 = ‘오답 재풀이’ 표시가 없는 일반 채점. 같은 범위를 다시 일반 채점하면 각각 포함돼요.<br>최근 오답은 선택한 기간 내 각 세트의 마지막 채점 기준이에요. 기간 밖 재풀이와 별도로 한 공부는 반영되지 않아요.<br>풀이 시간은 학생이 입력한 경우에만 표시해요. 채점 사이의 시간으로 공부 시간을 추정하지 않아요.</div></div></details>`;
    el('studyResults').querySelectorAll('[data-history]').forEach(button => button.addEventListener('click',()=>{
      historyFilter = button.dataset.history; historyLimit = 30;
      el('studyResults').querySelectorAll('[data-history]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      renderHistory();
    }));
    renderHistory();
  }

  function renderHistory() {
    const rows = report.summary.rows.filter(r=>historyFilter==='all' || (historyFilter==='retry')===M.isRetry(r)).slice().reverse();
    el('studyHistory').innerHTML = `<div class="study-history">${rows.slice(0,historyLimit).map(r=>{
      const retry = M.isRetry(r);
      const wrong = Array.isArray(r.wrong_questions)?r.wrong_questions:[];
      const detail = Array.isArray(r.wrong_detail)?r.wrong_detail:[];
      const times = Object.entries(r.part_times || {}).filter(([,v])=>Number(v)>0 && Number.isFinite(Number(v)));
      return `<details class="study-record"><summary><time datetime="${escape(r.created_at)}">${dateText(M.kstDate(r.created_at))} ${timeText(r.created_at)}</time><span class="study-record-title"><span class="study-badge${retry?' retry':''}">${retry?'재풀이':'일반 풀이'}</span>${escape(M.baseLabel(r))}</span><span class="study-record-score">${num(r.score)}/${num(r.total)}</span></summary><div class="study-record-body"><p>${wrong.length?`틀린 문항: ${wrong.map(n=>`${escape(n)}번`).join(', ')}`:'틀린 문항 없음'}</p>${detail.length?`<p>${detail.map(d=>`${escape(d.n)}번: 선택 ${escape(d.p)} → 정답 ${escape(d.a)}`).join(' · ')}</p>`:''}<p>${times.length?`입력한 풀이 시간: ${times.map(([k,v])=>`${escape(k)} ${escape(v)}분`).join(' · ')}`:'풀이 시간 미입력'}</p></div></details>`;
    }).join('')}</div>${rows.length?'':'<p class="study-empty">해당하는 풀이 내역이 없어요.</p>'}${rows.length>historyLimit?`<button class="btn ghost study-more" id="studyMore" type="button">내역 더 보기 (${historyLimit}/${rows.length})</button>`:''}`;
    const more = el('studyMore');
    if (more) more.addEventListener('click',()=>{historyLimit+=30;renderHistory();});
  }

  async function init(client, index) {
    if (initialized) return;
    initialized = true; db = client; catalog = Array.isArray(index)?index:[];
    setPreset('week');
    el('studyForm').addEventListener('submit',event=>{event.preventDefault();load();});
    el('studyStudent').addEventListener('change',load);
    ['studyStart','studyEnd'].forEach(id=>el(id).addEventListener('change',()=>{
      clearReport();
      document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed','false'));
      setStatus('기간을 바꿨어요. 조회를 누르면 새 기간의 기록을 볼 수 있어요.');
    }));
    document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{setPreset(button.dataset.period);load();}));
    try {
      const rows = await allRows('students','id,name,created_at');
      const names = [...new Set(rows.map(r=>r.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
      el('studyStudent').innerHTML = '<option value="">학생 선택</option>' + names.map(name=>`<option value="${escape(name)}">${escape(name)}</option>`).join('');
      let remembered = '';
      try { remembered = localStorage.getItem('admin_study_student') || ''; } catch (_) { /* No storage required. */ }
      if (names.includes(remembered)) { el('studyStudent').value = remembered; load(); }
      else setStatus(names.length?'학생을 선택하면 기간별 학습 기록을 볼 수 있어요.':'등록된 학생이 없어요. 학생 명단에서 먼저 등록해 주세요.');
    } catch (_) {
      el('studyStudent').innerHTML = '<option value="">학생 명단을 불러오지 못했어요</option>';
      initialized = false;
      setStatus('학생 명단을 불러오지 못했어요. 페이지를 새로고침해 주세요.',true);
    }
  }
  window.AdminStudyDashboard = {init};
})();
