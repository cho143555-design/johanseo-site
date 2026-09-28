/* Read-only reason review, using the existing authenticated submissions policy. */
(() => {
  'use strict';
  const tools=document.getElementById('adminTools');
  if(!tools || !window.supabase) return;
  const client=typeof sb!=='undefined' ? sb : window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
  const style=el('style');
  style.textContent='.reason-review-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.reason-review-toolbar input{flex:1;min-width:160px}.reason-review-item{border-top:1px solid var(--line);padding:12px 0;overflow-wrap:anywhere}.reason-review-item p{white-space:pre-wrap;margin:6px 0;line-height:1.7}.reason-review-item h4{margin:0 0 10px}.reason-review-attempt>summary{cursor:pointer;padding:12px 0;line-height:1.7}.reason-review-attempt{border-bottom:1px solid var(--line)}';
  document.head.append(style);
  const panel=el('details',null,'faq-item');panel.id='reasonReview';
  panel.append(el('summary','풀이 근거 확인 — 첫 제출과 오답 재풀이'));
  const body=el('div',null,'faq-body');
  body.append(el('p','답을 맞혔는지와 근거가 타당한지는 별개야. 처음 쓴 근거와 재풀이에서 바뀐 판단을 함께 확인해 주세요.'));
  const toolbar=el('div',null,'reason-review-toolbar');
  const filter=el('input');filter.type='text';filter.placeholder='학생 이름';filter.setAttribute('aria-label','풀이 근거를 확인할 학생 이름');
  const refresh=el('button','조회','btn ghost');refresh.type='button';
  toolbar.append(filter,refresh);body.append(toolbar);
  const status=el('p');status.setAttribute('role','status');
  const list=el('div');
  const more=el('button','더 보기','btn ghost');more.type='button';more.hidden=true;
  body.append(status,list,more);panel.append(body);
  (document.querySelector('#admin-class .admin-tool-list') || tools).prepend(panel);
  const nav=document.getElementById('adminQuickNav');
  if(nav){const link=el('a','풀이 근거');link.href='#reasonReview';nav.append(link);}
  let offset=0,busy=false,loaded=false,who='';
  const pageSize=50;
  const formatDate=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  function render(row){
    const record=row.reasoning;
    const details=el('details',null,'reason-review-attempt');
    details.append(el('summary',`${row.student_name} · ${record.attempt===1?'첫 제출':`${record.attempt-1}차 재풀이`} · ${row.score}/${row.total}\n${row.label || ''} · ${formatDate(row.created_at)}`));
    (record.items || []).forEach(item=>{
      const card=el('article',null,'reason-review-item');
      const wrong=(row.wrong_questions || []).includes(item.n);
      card.append(el('h4',`${item.n}번 · ${item.p}번 선택 · ${wrong?'오답':'정답'}`));
      if(record.attempt===1){card.append(el('p',`처음 고른 이유: ${item.reason}`));}
      else{
        card.append(el('p',`처음 선택: ${item.first_answer}번\n처음 근거: ${item.first_reason}`));
        if(item.previous_reason!==item.first_reason || item.previous_answer!==item.first_answer) card.append(el('p',`직전 선택: ${item.previous_answer}번\n직전 근거: ${item.previous_reason}`));
        card.append(el('p',`처음 잘못 생각한 점: ${item.mistake}`));
        card.append(el('p',`지금 답이라고 보는 근거: ${item.reason}`));
      }
      details.append(card);
    });
    return details;
  }
  async function load(reset){
    if(busy)return;busy=true;refresh.disabled=true;more.disabled=true;
    if(reset){offset=0;who=filter.value.trim();list.replaceChildren();}
    status.textContent='풀이 근거를 불러오는 중…';
    try{
      const {data:auth,error:authError}=await client.auth.getSession();
      if(authError || !auth?.session)throw new Error('관리자로 로그인한 뒤 조회해 주세요.');
      let query=client.from('submissions').select('id,label,student_name,score,total,created_at,wrong_questions,reasoning').not('reasoning','is',null).order('created_at',{ascending:false}).range(offset,offset+pageSize-1);
      if(who)query=query.eq('student_name',who);
      const {data,error}=await query;
      if(error)throw error;
      (data||[]).forEach(row=>list.append(render(row)));
      offset+=(data||[]).length;loaded=true;more.hidden=(data||[]).length<pageSize;
      status.textContent=offset?`${offset}회 제출 기록 · 최근 제출부터 표시`:'아직 저장된 풀이 근거가 없어. 기능 적용 이후 제출한 답안부터 여기에 표시돼.';
    }catch(error){status.textContent=`불러오지 못했습니다: ${error.message || String(error)}`;more.hidden=true;}
    finally{busy=false;refresh.disabled=false;more.disabled=false;}
  }
  panel.addEventListener('toggle',()=>{if(panel.open&&!loaded)load(true);});
  refresh.addEventListener('click',()=>load(true));
  filter.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();load(true);}});
  more.addEventListener('click',()=>load(false));
})();
