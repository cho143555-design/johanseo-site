/* Shared, dependency-free validation. No grading keys or student records belong here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PpajakReasoningCore = api;
})(globalThis, function () {
  'use strict';
  const BOOKS = ['2027 빠작 중학 문학 독해 2', '2027 빠작 중학 비문학 독해 2'];
  const isTarget = material => BOOKS.includes(material);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fail = message => { const err = new Error(message); err.status = 400; throw err; };
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim()) fail(label + '을(를) 짧게 적어 주세요.');
    if (value.length > 1000) fail(label + '이 너무 깁니다. 1000자 이내로 적어 주세요.');
    return value.trim();
  }
  function input(raw, keys, retry) {
    if (!raw || !UUID.test(raw.request_id || '')) fail('풀이 근거 입력 화면을 새로고침한 뒤 다시 제출해 주세요.');
    if (!Array.isArray(raw.items) || raw.items.length !== keys.length) fail('모든 문항에 선택 이유를 적어 주세요.');
    if (retry && !UUID.test(raw.parent_id || '')) fail('먼저 첫 답안과 선택 이유를 제출한 뒤 오답 재풀이를 해 주세요.');
    if (!retry && raw.parent_id) fail('첫 제출에는 이전 재풀이 기록을 연결할 수 없습니다.');
    const seen = new Set();
    const map = new Map();
    raw.items.forEach(item => {
      if (!item || !Number.isInteger(item.n) || seen.has(item.n)) fail('풀이 근거의 문항 번호를 확인해 주세요.');
      seen.add(item.n); map.set(item.n, item);
    });
    return {
      request_id: raw.request_id,
      parent_id: retry ? raw.parent_id : null,
      items: keys.map(key => {
        const item = map.get(key.no);
        if (!item) fail(key.no + '번 선택 이유가 없습니다.');
        return { n: key.no, reason: text(item.reason, key.no + '번 선택 이유'), mistake: retry ? text(item.mistake, key.no + '번 처음 잘못 생각한 점') : null };
      })
    };
  }
  function sameScope(a, b) {
    return ['material', 'chapter', 'section', 'start_no', 'end_no', 'set_code'].every(k => (a[k] ?? null) === (b[k] ?? null));
  }
  function record(clean, scope, keys, answers, parent, studentName, id) {
    if (parent) {
      if (!parent.reasoning || parent.student_name !== studentName || !sameScope(parent.reasoning, scope)) fail('다른 학생이나 다른 과제의 재풀이 기록은 연결할 수 없습니다.');
      const previousWrong = new Set(parent.wrong_questions || []);
      if (previousWrong.size !== keys.length || keys.some(k => !previousWrong.has(k.no))) fail('바로 전 제출에서 틀린 문항만 다시 풀어 주세요.');
    }
    const previous = new Map((parent?.reasoning?.items || []).map(x => [x.n, x]));
    return {
      version: 1, ...scope,
      attempt: parent ? parent.reasoning.attempt + 1 : 1,
      root_id: parent ? parent.reasoning.root_id : id,
      parent_id: parent ? parent.id : null,
      items: clean.items.map((item, i) => {
        const prev = previous.get(item.n);
        if (parent && !prev) fail(item.n + '번의 이전 풀이 기록을 찾지 못했습니다.');
        return {
          ...item, p: answers[i],
          first_answer: prev ? prev.first_answer : answers[i],
          first_reason: prev ? prev.first_reason : item.reason,
          previous_answer: prev ? prev.p : null,
          previous_reason: prev ? prev.reason : null
        };
      })
    };
  }
  function sameRequest(row, clean, scope, answers, studentName) {
    return row.student_name === studentName && row.reasoning && sameScope(row.reasoning, scope)
      && (row.reasoning.parent_id || null) === clean.parent_id
      && JSON.stringify(row.answers) === JSON.stringify(answers)
      && JSON.stringify(row.reasoning.items.map(i => ({n:i.n,reason:i.reason,mistake:i.mistake}))) === JSON.stringify(clean.items);
  }
  return { BOOKS, isTarget, input, record, sameScope, sameRequest };
});
