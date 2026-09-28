/* Scoped adapter for the existing homework renderer and smooth-task request. */
(() => {
  'use strict';
  const BOOKS = ['2027 빠작 중학 문학 독해 2', '2027 빠작 중학 비문학 독해 2'];
  const $ = id => document.getElementById(id);
  const omr = $('omr'), wrap = $('omrWrap'), button = $('submitBtn');
  if (!omr || !wrap || !button) return;
  const endpoint = `${window.SUPABASE_URL}/functions/v1/smooth-task`;
  const rawFetch = window.fetch.bind(window);
  const memory = new Map();
  const storage = {
    get(key) { try { return JSON.parse(sessionStorage.getItem('ppajak-reasons-v1:' + key) || 'null'); } catch (_) { return null; } },
    put(key, value) { try { sessionStorage.setItem('ppajak-reasons-v1:' + key, JSON.stringify(value)); } catch (_) {} }
  };
  function context() {
    const inSet = $('setView') && $('setView').style.display !== 'none';
    const option = inSet ? $('setSelect')?.selectedOptions[0] : null;
    const material = inSet ? option?.dataset.mat : $('mSel')?.value;
    const chapter = inSet ? option?.dataset.ch : $('cSel')?.value;
    const section = inSet ? option?.dataset.sec : $('secSel')?.value;
    const name = $('name')?.value.trim() || '';
    const key = JSON.stringify([name, material || '', chapter || '', section || '', inSet ? option?.value : '', $('startNo')?.value || '', $('endNo')?.value || '']);
    return {name,material,chapter,section,key,target:BOOKS.includes(material)};
  }
  function state(key) {
    if (!memory.has(key)) memory.set(key, storage.get(key) || {last:null,drafts:{},requests:{}});
    return memory.get(key);
  }
  function save(key) { storage.put(key, state(key)); }
  function add(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  const style = add('style');
  style.textContent = `.omr-row.ppajak-reason-row{display:flex;flex-wrap:wrap;align-items:center}.ppajak-reason-fields{flex:0 0 100%;min-width:0;box-sizing:border-box;padding:6px 0 8px}.ppajak-reason-fields label{display:block;font-size:14px;line-height:1.6;margin:8px 0 5px;font-weight:600}.ppajak-reason-fields textarea{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:70px;resize:vertical;font:inherit;font-size:16px;line-height:1.6;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);color:var(--ink)}.ppajak-reason-fields textarea[aria-invalid=true]{border:2px solid var(--jumuk)}.ppajak-reason-previous{font-size:13px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0;padding:8px 10px;border-left:2px solid var(--line)}.ppajak-reason-help{font-size:14px;line-height:1.7;margin:8px 0 14px;overflow-wrap:anywhere}`;
  document.head.append(style);
  const help = add('p','ppajak-reason-help');
  omr.before(help);
  let form = null, scheduled = false;
  function render() {
    const ctx = context();
    const rows = [...omr.querySelectorAll('.omr-row')];
    const retry = wrap.dataset.studyMode === 'retry';
    if (!ctx.target || !rows.length) {
      help.hidden = true; form = null;
      const receipt=$('ppajakReasonReceipt'); if(receipt)receipt.hidden=true;
      rows.forEach(row => { row.classList.remove('ppajak-reason-row'); row.querySelector('.ppajak-reason-fields')?.remove(); });
      return;
    }
    const changed = !form || form.ctx.key !== ctx.key || form.retry !== retry || form.rows.length !== rows.length || form.rows.some((row,i) => row !== rows[i]);
    if (changed) {
      const last = state(ctx.key).last;
      form = {ctx, rows, retry, parent:retry ? last : null};
      form.draftKey = JSON.stringify([retry ? (last?.id || 'missing') : 'first',rows.map(row => row.querySelector('.qno')?.textContent)]);
    }
    help.hidden = false;
    help.textContent = retry ? '처음엔 무엇을 잘못 생각해서 틀렸는지 쓰고, 지금은 왜 이 선지가 정답이라고 생각하는지 쓰시오.' : '이 선지가 정답이라고 생각하는 이유를 한 마디만 쓰시오.';
    const draft = state(ctx.key).drafts[form.draftKey] || {};
    const draftKey = form.draftKey;
    rows.forEach((row, i) => {
      if (!changed && row.querySelector('.ppajak-reason-fields')) return;
      row.querySelector('.ppajak-reason-fields')?.remove();
      row.classList.add('ppajak-reason-row');
      const n = Number(row.querySelector('.qno').textContent);
      const fields = add('div','ppajak-reason-fields'); fields.dataset.n = String(n);
      const previous = form.parent?.items?.find(item => item.n === n);
      if (retry && previous) {
        fields.append(add('p','ppajak-reason-previous',`처음 고른 답: ${previous.first_answer}번\n처음 쓴 이유: ${previous.first_reason}`));
        if (previous.reason !== previous.first_reason || previous.p !== previous.first_answer) fields.append(add('p','ppajak-reason-previous',`직전 풀이: ${previous.p}번\n직전 이유: ${previous.reason}`));
      }
      function field(kind, label) {
        const id = `ppajak-${kind}-${i}`;
        const lab = add('label',null,label); lab.htmlFor = id;
        const input = add('textarea'); input.id=id; input.rows=2; input.maxLength=1000; input.required=true; input.dataset.reasonField=kind;
        input.setAttribute('aria-label',`${n}번 ${label}`);
        input.value = draft[n]?.[kind] || '';
        input.addEventListener('input', () => {
          input.removeAttribute('aria-invalid');
          const s=state(ctx.key); s.drafts[draftKey] ||= {}; s.drafts[draftKey][n] ||= {};
          s.drafts[draftKey][n][kind]=input.value; save(ctx.key);
        });
        fields.append(lab,input);
      }
      if (retry) field('mistake','처음엔 무엇을 잘못 생각해서 틀렸는지 쓰고,');
      field('reason',retry ? '지금은 왜 이 선지가 정답이라고 생각하는지 쓰시오.' : '이 선지가 정답이라고 생각하는 이유를 한 마디만 쓰시오.');
      row.append(fields);
    });
  }
  function schedule() { if (!scheduled) { scheduled=true; queueMicrotask(()=>{scheduled=false;render();}); } }
  new MutationObserver(schedule).observe(omr,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(wrap,{attributes:true,attributeFilter:['data-study-mode','data-study-selection','style']});
  document.addEventListener('change',schedule);
  $('name').addEventListener('input',schedule);
  function collect() {
    render();
    if (!form || !form.ctx.target) return null;
    const items=[];
    for (const row of form.rows) {
      const fields=row.querySelector('.ppajak-reason-fields');
      if (!fields) throw new Error('풀이 근거 입력칸을 불러오지 못했습니다. 새로고침해 주세요.');
      const item={n:Number(fields.dataset.n)};
      for (const input of fields.querySelectorAll('textarea')) {
        if (!input.value.trim()) { input.setAttribute('aria-invalid','true'); input.focus(); throw new Error(`${item.n}번 ${input.dataset.reasonField==='mistake' ? '처음 잘못 생각한 점' : '선택 이유'}을(를) 짧게 적어 주세요.`); }
        item[input.dataset.reasonField]=input.value.trim();
      }
      items.push(item);
    }
    if (form.retry && !form.parent?.id) throw new Error('이 브라우저에 첫 제출 기록이 없습니다. 첫 답안과 선택 이유를 먼저 제출해 주세요.');
    return {items,parent_id:form.retry ? form.parent.id : null};
  }
  button.addEventListener('click',event=>{
    if (!context().target) return;
    try { collect(); }
    catch (error) {
      event.preventDefault(); event.stopImmediatePropagation();
      const err=$('err'); err.textContent=error.message; err.style.display='block';
    }
  },true);
  window.fetch = async function(input, init) {
    const url=typeof input==='string' ? input : input instanceof URL ? input.href : '';
    if (url!==endpoint || typeof init?.body!=='string') return rawFetch(input,init);
    let body; try {body=JSON.parse(init.body);} catch (_) {return rawFetch(input,init);}
    const ctx=context();
    if (body.type==='question' || !Array.isArray(body.answers) || !ctx.target || (body.material && body.material!==ctx.material)) return rawFetch(input,init);
    const clean=collect();
    if (!clean || ctx.name!==body.student_name) throw new Error('학생 이름과 과제를 다시 확인해 주세요.');
    const activeForm=form;
    const s=state(ctx.key);
    const signature=JSON.stringify([body,clean]);
    s.requests[activeForm.draftKey] ||= {};
    let request=s.requests[activeForm.draftKey];
    if(request.signature!==signature) request=s.requests[activeForm.draftKey]={signature,id:crypto.randomUUID()};
    body.reasoning={...clean,request_id:request.id}; save(ctx.key);
    const locked=['name','mSel','cSel','secSel','setSelect','loadBtn','tabRange','tabSet'].map(id=>$(id)).filter(Boolean).map(el=>({el,disabled:el.disabled}));
    locked.forEach(({el})=>{el.disabled=true;});
    try {
      const response=await rawFetch(input,{...init,body:JSON.stringify(body)});
      const result=await response.clone().json();
      if(response.ok) {
        if(!result.submission_id || !result.reasoning_saved) throw new Error('선택 이유가 저장됐는지 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        const parent=activeForm.parent;
        const previous=new Map((parent?.items || []).map(item=>[item.n,item]));
        s.last={id:result.submission_id,wrong_questions:result.wrong_questions,items:clean.items.map((item,i)=>{
          const prev=previous.get(item.n);
          return {...item,p:body.answers[i],first_answer:prev ? prev.first_answer : body.answers[i],first_reason:prev ? prev.first_reason : item.reason};
        })};
        save(ctx.key);
        let receipt=$('ppajakReasonReceipt');
        if(!receipt){receipt=add('p','ppajak-reason-help');receipt.id='ppajakReasonReceipt';$('result').append(receipt);}
        receipt.hidden=false;
        receipt.textContent='답안과 선택 이유가 함께 저장됐어. 선택 이유의 내용은 선생님이 확인할 거야.';
      }
      return response;
    } finally {locked.forEach(({el,disabled})=>{el.disabled=disabled;});}
  };
  render();
  window.PpajakReasonsReady=true;
})();
