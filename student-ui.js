/* Presentation helpers only: the existing page owns answers, grading, and note writes. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const omr = byId('omr');
  if (omr) {
    const wrap = byId('omrWrap');
    const result = byId('result');
    function refreshAnswers() {
      const rows = [...omr.querySelectorAll('.omr-row')];
      const count = rows.filter(row => row.querySelector('.bubble.on')).length;
      const retry = wrap.dataset.studyMode === 'retry';
      setText(byId('studentAnswerCount'), `${count} / ${rows.length} 입력`);
      setText(byId('studentAnswerTitle'), retry ? '오답 다시 풀기' : '답안 입력');
      byId('studentAnswerProgress').style.width = rows.length ? `${count / rows.length * 100}%` : '0%';
      rows.forEach(row => {
        const label = row.querySelector('.qno').textContent;
        const group = row.querySelector('.bubbles');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', `${label}번 문항`);
        row.querySelectorAll('.bubble').forEach(button => {
          button.setAttribute('aria-pressed', String(button.classList.contains('on')));
          button.setAttribute('aria-label', `${label}번 문항 ${button.dataset.c}번 답`);
        });
        if (row.querySelector('.bubble.on') && row.classList.contains('is-missing')) row.classList.remove('is-missing');
      });
      setText(byId('studentSelection'), wrap.dataset.studySelection || '');
      const step = result.classList.contains('show') ? '3' : wrap.style.display !== 'none' && rows.length ? '2' : '1';
      document.querySelectorAll('[data-student-step]').forEach(item => {
        if (item.dataset.studentStep === step) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
    }
    let scheduled = false;
    function scheduleRefresh() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; refreshAnswers(); });
    }
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(omr, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    observer.observe(wrap, { attributes:true, attributeFilter:['style', 'data-study-mode', 'data-study-selection'] });
    observer.observe(result, { attributes:true, attributeFilter:['class'] });
    document.addEventListener('change', scheduleRefresh);
    byId('submitBtn').addEventListener('click', () => {
      if (!byId('name').value.trim()) return;
      const missing = [...omr.querySelectorAll('.omr-row')].filter(row => !row.querySelector('.bubble.on'));
      missing.forEach(row => row.classList.add('is-missing'));
      if (missing.length) missing[0].querySelector('.bubble').focus();
    });
    refreshAnswers();
  }
  const noteList = byId('nbList');
  if (noteList) {
    let filter = 'live';
    const buttons = [...document.querySelectorAll('[data-note-filter]')];
    function refreshNotes() {
      const cards = [...noteList.querySelectorAll('.nb-item')];
      const live = cards.filter(card => !card.classList.contains('resolved')).length;
      const done = cards.length - live;
      setText(byId('studentLiveCount'), String(live));
      setText(byId('studentDoneCount'), String(done));
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.noteFilter === filter)));
      cards.forEach(card => { card.hidden = (card.classList.contains('resolved') ? 'done' : 'live') !== filter; });
      noteList.querySelectorAll('[data-note-group]').forEach(group => { group.hidden = group.dataset.noteGroup !== filter; });
      const empty = byId('studentFilterEmpty');
      empty.hidden = !cards.length || (filter === 'live' ? live : done) > 0;
      setText(empty, filter === 'live' ? '다시 볼 문제를 모두 확인했어.' : '아직 복습을 마친 문제가 없어. 이해한 문제는 ‘이제 맞출 수 있어’를 눌러 옮겨봐.');
    }
    buttons.forEach(button => button.addEventListener('click', () => { filter = button.dataset.noteFilter; refreshNotes(); }));
    new MutationObserver(refreshNotes).observe(noteList, { childList:true });
    refreshNotes();
  }
})();
