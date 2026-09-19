/* Organize the existing tools without replacing nodes or their event handlers. */
(() => {
  'use strict';

  const tools = document.getElementById('adminTools');
  const nav = document.getElementById('adminQuickNav');
  if (!tools || !nav) return;

  const groups = [
    { id: 'admin-class', name: '수업 기록', description: '제출 내역부터 질문과 복습할 문제까지.', controls: ['subFilter', 'qList', 'nbAdminList', 'rpName', 'stSel'] },
    { id: 'admin-students', name: '학생과 과제', description: '학생별 교재를 정하고, 과제를 내고 확인하세요.', controls: ['stuName', 'bkMaterial', 'setList'] },
    { id: 'admin-materials', name: '교재 관리', description: '교재와 정답, 직접 만든 학습지를 관리하세요.', controls: ['matList', 'bulkText', 'edMat', 'setCode'] },
    { id: 'admin-home', name: '홈페이지 편집', description: '소개와 수업 안내, 칼럼을 관리하세요.', controls: ['heroText', 'teacherText', 'lessonsText', 'colText', 'faqText'] },
    { id: 'admin-guides', name: '학습 안내', description: '채점과 복습 화면에 보여줄 내용을 관리하세요.', controls: ['guideText', 'habitText2', 'perfText', 'songText', 'askText2', 'askMockText', 'partsText', 'exText', 'nbGuideText'] }
  ];

  const originalTools = [...tools.children].filter(node => node.matches('details.faq-item'));
  const groupedTools = new Set();
  const navigation = [{ id: 'studyDashboard', name: '숙제 확인' }];

  groups.forEach(group => {
    const details = group.controls.map(id => document.getElementById(id)?.closest('details.faq-item'))
      .filter(node => node && node.parentElement === tools && !groupedTools.has(node));
    if (!details.length) return;

    const section = document.createElement('section');
    section.className = 'admin-tool-group';
    section.id = group.id;
    section.setAttribute('aria-labelledby', `${group.id}-title`);

    const heading = document.createElement('div');
    heading.className = 'admin-group-heading';
    const title = document.createElement('h2');
    title.id = `${group.id}-title`;
    title.textContent = group.name;
    const description = document.createElement('p');
    description.textContent = group.description;
    heading.append(title, description);

    const list = document.createElement('div');
    list.className = 'admin-tool-list';
    details.forEach(detail => {
      groupedTools.add(detail);
      list.append(detail);
    });
    section.append(heading, list);
    tools.append(section);
    navigation.push({ id: group.id, name: group.name });
  });

  // New tools remain available even if a future editor has not assigned a group.
  const remainder = originalTools.filter(node => !groupedTools.has(node));
  remainder.forEach(node => tools.append(node));

  navigation.forEach((item, index) => {
    const link = document.createElement('a');
    link.href = `#${item.id}`;
    link.textContent = item.name;
    if (index === 0) link.className = 'admin-nav-primary';
    nav.append(link);
  });
  nav.hidden = false;

  function markCurrent() {
    const target = window.location.hash || '#studyDashboard';
    nav.querySelectorAll('a').forEach(link => {
      if (link.getAttribute('href') === target) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', markCurrent);
  markCurrent();

  [['subFilter', '제출 기록에서 학생 이름 검색'], ['stuName', '추가할 학생 이름'], ['rpName', '리포트를 조회할 학생 이름'], ['nbAdminWho', '보관함 학생 선택']].forEach(([id, label]) => {
    document.getElementById(id)?.setAttribute('aria-label', label);
  });
})();
