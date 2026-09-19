/* Public home content stays editable through the existing site_content fields. */
(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const format = value => escape(value).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const lineBreaks = value => format(value).replace(/\s*\/\/\s*/g, '<br>');
  const readFields = content => {
    const fields = {};
    String(content || '').replace(/\r/g, '').split('\n').forEach(line => {
      const colon = line.indexOf(':');
      if (colon < 0) return;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (value) (fields[key] ||= []).push(value);
    });
    return fields;
  };

  function titleHtml(lines, accent = false) {
    return lines.map(line => {
      // The editor's emphasis also gives a natural line break for the large title.
      const split = line.indexOf('**');
      if (lines.length === 1 && split > 0) {
        return format(line.slice(0, split).trim()) + '<br>' + (accent ? '<em>' : '') + format(line.slice(split)) + (accent ? '</em>' : '');
      }
      return lineBreaks(line);
    }).join('<br>');
  }

  function parseColumns(content) {
    const categories = [];
    const intro = [[]];
    let category = null;
    let item = null;
    String(content || '').replace(/\r/g, '').split('\n').forEach(line => {
      const text = line.trim();
      if (!text) {
        if (item && item.paragraphs.at(-1).length) item.paragraphs.push([]);
        else if (!category && !item && intro.at(-1).length) intro.push([]);
        return;
      }
      let match;
      if ((match = text.match(/^범주\s*:\s*(.+)$/))) {
        category = { name: match[1].trim(), items: [] };
        categories.push(category);
        item = null;
      } else if ((match = text.match(/^제목\s*:\s*(.+)$/))) {
        if (!category) { category = { name: '', items: [] }; categories.push(category); }
        item = { title: match[1].trim(), paragraphs: [[]] };
        category.items.push(item);
      } else if (item) item.paragraphs.at(-1).push(text);
      else if (!category) intro.at(-1).push(text);
    });
    return { categories, intro };
  }

  const plainTitle = title => title.replace(/^\d+\.\s*/, '').replace('모의고사가 직후 15분', '모의고사 직후 15분');
  const paragraphHtml = paragraphs => paragraphs.filter(p => p.length).map(p => `<p>${format(p.join('\n')).replace(/\n/g, '<br>')}</p>`).join('');
  const featuredTitles = ['사설 모의고사', '무너짐은 이상과 현실의 괴리에서', '모의고사 직후 15분'];

  function columnHtml(item, number, prefix) {
    const title = prefix === 'featured' ? plainTitle(item.title) : item.title.replace('모의고사가 직후 15분', '모의고사 직후 15분');
    return `<details class="column-row" id="${prefix}-${number}"><summary><span class="num">${String(number).padStart(2, '0')}</span><h3>${format(title)}</h3></summary><div class="article-body">${paragraphHtml(item.paragraphs)}</div></details>`;
  }

  function columnsHtml(content) {
    const parsed = parseColumns(content);
    const items = parsed.categories.flatMap(category => category.items);
    const featured = featuredTitles.map(title => items.find(item => plainTitle(item.title) === title)).filter(Boolean);
    let count = 0;
    return {
      featured: featured.map((item, i) => columnHtml(item, i + 1, 'featured')).join(''),
      intro: paragraphHtml(parsed.intro),
      all: parsed.categories.map(category => `<div class="column-category">${category.name ? `<h3 class="column-category-title">${escape(category.name)}</h3>` : ''}${category.items.map(item => columnHtml(item, ++count, 'article')).join('')}</div>`).join(''),
      count: items.length,
      featuredCount: featured.length
    };
  }

  function teacherHtml(content) {
    const fields = readFields(content);
    if (!fields['이름']?.length) return '';
    const name = fields['이름'][0];
    const catches = fields['캐치'] || [];
    const catchHtml = catches.map(line => lineBreaks(line).replace(/(<\/b>에게 배우면)\s+(다릅니다\.)/, '$1<br>$2')).join('<br>');
    const credentials = (fields['이력'] || []).map((line, i) => `<li>${i === 0 ? '<strong>' + escape(name) + ' · ' + format(line) + '</strong>' : format(line)}</li>`).join('');
    const points = (fields['설명'] || []).map(line => {
      const split = line.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.*)$/);
      return split ? `<div><b>${escape(split[1])}</b><p>${lineBreaks(split[2])}</p></div>` : `<div><p>${lineBreaks(line)}</p></div>`;
    }).join('');
    return `<p class="eyebrow">${escape(name)} 선생님</p><h2>${catchHtml || escape(name)}</h2><ul class="credentials">${credentials}</ul>${points ? `<div class="teacher-points">${points}</div>` : ''}`;
  }

  function lessonsHtml(content) {
    const lines = String(content || '').replace(/\r/g, '').split('\n');
    let title = '';
    const titleIndex = lines.findIndex(line => line.trim().startsWith('# '));
    if (titleIndex >= 0) { title = lines[titleIndex].trim().slice(2); lines.splice(0, titleIndex + 1); }
    let html = '';
    lines.join('\n').split(/\n\s*\n/).forEach(block => {
      const parts = block.split('\n').map(line => line.trim()).filter(Boolean);
      if (!parts.length) return;
      if (parts.length === 1 && parts[0] === '---') { html += '<hr>'; return; }
      if (parts[0].startsWith('# ')) html += `<h3>${format(parts.shift().slice(2))}</h3>`;
      if (parts.length) html += `<p>${format(parts.join('\n')).replace(/\n/g, '<br>')}</p>`;
    });
    return { title, html };
  }

  // Shared with the local content checks; no browser globals are required for parsing.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escape, format, readFields, titleHtml, parseColumns, columnsHtml, teacherHtml, lessonsHtml };
    return;
  }

  const byId = id => document.getElementById(id);
  const setHtml = (id, html) => { const element = byId(id); if (element) element.innerHTML = html; };

  function renderHero(content) {
    const fields = readFields(content);
    if (fields['윗줄']) byId('heroEyebrow').textContent = fields['윗줄'][0];
    if (fields['수능라벨']) {
      byId('satTag').textContent = '조한서 · ' + fields['수능라벨'][0];
      byId('satCourseTag').textContent = fields['수능라벨'][0];
    }
    if (fields['제목']) {
      setHtml('heroH1', titleHtml(fields['제목'], true));
      setHtml('satCourseTitle', titleHtml(fields['제목']));
    }
    if (fields['리드']) setHtml('heroLead', fields['리드'].map((line, i) => i === 0 ? `<strong>${format(line)}</strong>` : format(line)).join('<br>'));
    const hasNaesin = !!(fields['내신제목']?.length || fields['내신리드']?.length);
    byId('naesinBlock').hidden = !hasNaesin;
    byId('courseGrid').classList.toggle('single-course', !hasNaesin);
    if (fields['내신라벨']) byId('naesinTag').textContent = fields['내신라벨'][0];
    setHtml('naesinTitle', titleHtml(fields['내신제목'] || []));
    setHtml('naesinLead', (fields['내신리드'] || []).map(format).join('<br>'));
  }

  function renderTeacher(content) {
    const html = teacherHtml(content);
    if (!html) return;
    setHtml('teacherInfo', html);
    const fields = readFields(content);
    const credentials = fields['이력'] || [];
    ['heroCredential', 'heroUniversity'].forEach((id, index) => {
      const text = (credentials[index] || '').replace(/\*\*/g, '');
      byId(id).textContent = text;
      byId(id + 'Group').hidden = !text;
    });
    byId('heroFoot').hidden = !credentials.length;
    setHtml('satCourseLead', (fields['강점'] || []).map(lineBreaks).join('<br>'));
  }

  function renderLessons(content) {
    const { title, html } = lessonsHtml(content);
    const visible = !!(title || html);
    byId('lessons').hidden = !visible;
    byId('navLessons').hidden = !visible;
    setHtml('lessonsTitle', format(title));
    setHtml('lessonsBody', html);
  }

  function renderColumns(content) {
    const result = columnsHtml(content);
    // Empty content is an intentional admin edit; do not keep stale articles on screen.
    byId('column').hidden = !result.count;
    if (!result.count) return;
    const opened = new Set([...document.querySelectorAll('.column-row[open]')].map(element => element.id));
    setHtml('columnIntro', result.intro);
    byId('columnIntro').hidden = !result.intro;
    setHtml('featuredColumns', result.featured);
    setHtml('allColumnList', result.all);
    byId('featuredCount').textContent = result.featuredCount ? '01 — ' + String(result.featuredCount).padStart(2, '0') : '';
    byId('allColumnCount').textContent = result.count;
    opened.forEach(id => { const element = byId(id); if (element) element.open = true; });
  }

  const renderers = { hero: renderHero, teacher: renderTeacher, lessons: renderLessons, columns: renderColumns };
  let refreshing = false;
  let client;
  async function refreshContent() {
    if (refreshing || !window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    refreshing = true;
    try {
      client ||= window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data, error } = await client.from('site_content').select('key,content').in('key', Object.keys(renderers));
      if (error || !data) return;
      data.forEach(row => {
        try { if (renderers[row.key]) renderers[row.key](row.content); }
        catch (error) { console.warn('홈 문구를 표시하지 못했습니다:', row.key); }
      });
    } catch (error) {
      // The current public content is also rendered in HTML, so the page stays usable offline.
    } finally { refreshing = false; }
  }
  window.__refreshContent = refreshContent;
  refreshContent();

  const installTabs = [...document.querySelectorAll('.install-tab')];
  function pickInstall(os) {
    installTabs.forEach(tab => {
      const active = tab.dataset.os === os;
      tab.classList.toggle('on', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.install-steps').forEach(panel => {
      panel.hidden = panel.dataset.panel !== os;
      panel.classList.toggle('on', panel.dataset.panel === os);
    });
  }
  installTabs.forEach(tab => tab.addEventListener('click', () => pickInstall(tab.dataset.os)));
  pickInstall(/iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ? 'ios' : 'android');

  function revealColumnHash() {
    const id = location.hash.slice(1);
    if (id === 'all-columns' || id.startsWith('article-')) byId('all-columns').open = true;
    const target = byId(id);
    if (target?.classList.contains('column-row')) target.open = true;
  }
  window.addEventListener('hashchange', revealColumnHash);
  revealColumnHash();

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= 60 * 1000) refreshContent();
    hiddenAt = 0;
  });
})();
