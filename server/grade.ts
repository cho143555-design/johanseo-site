// Existing smooth-task behavior plus append-only reasoning for two books.
// verify_jwt must remain true; service-role credentials stay in Edge secrets.
import { createClient } from "npm:@supabase/supabase-js@2";
import "./reasoning-core.js";
const reasoningCore = globalThis.PpajakReasoningCore;
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const CIRC=["①","②","③","④","⑤"];
const mark=v=>v?(CIRC[v-1]||String(v)):"무응답";
function cleanPartTimes(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const out={};let n=0;
  for(const [k,v] of Object.entries(raw)){
    if(n>=20)break;const key=String(k).trim().slice(0,30),min=Number(v);
    if(!key||!Number.isFinite(min)||min<=0||min>300)continue;
    out[key]=Math.round(min*10)/10;n++;
  }return n?out:null;
}
const timesLine=pt=>{
  if(!pt)return "";
  const parts=Object.entries(pt).map(([k,v])=>`${k} ${v}`).join(" · ");
  const sum=Object.values(pt).reduce((a,b)=>a+b,0);
  return `\n⏱ ${parts} (합 ${Math.round(sum*10)/10}분)`;
};
async function notifyDiscord({student_name,label,score,total,wrong_detail,part_times}){
  const url=Deno.env.get("DISCORD_WEBHOOK_URL");if(!url)return;
  const detail=wrong_detail.length?wrong_detail.map(w=>`${w.n}번 ${mark(w.p)} → 정답 ${mark(w.a)}`).join("\n"):"없음";
  const head=score===total?`🎉 **${student_name}** ${score}/${total} 만점`:`📝 **${student_name}** ${score}/${total}`;
  const content=`${head}\n${label}\n틀린 문항: ${detail}${timesLine(part_times)}`;
  try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});}catch(_){}
}
async function notifyQuestion({student_name,label,question}){
  const url=Deno.env.get("DISCORD_WEBHOOK_URL");if(!url)return;
  const content=`❓ **${student_name}** 질문\n${label||"(과제 정보 없음)"}\n> ${String(question).replace(/\n/g,"\n> ")}`;
  try{await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content,allowed_mentions:{parse:[]}})});}catch(_){}
}
async function fetchKeys(supabase,filters,startNo,endNo){
  let q=supabase.from("answer_bank").select("question_no, correct_answer, is_plus").eq("material",filters.material).eq("chapter",filters.chapter);
  q=filters.section?q.eq("section",filters.section):q.is("section",null);
  if(startNo!=null)q=q.gte("question_no",startNo).lte("question_no",endNo);
  const {data,error}=await q.order("question_no",{ascending:true});
  if(error)throw error;
  if(!data||!data.length)return json({error:"해당 범위의 정답이 등록되어 있지 않습니다."},404);
  if(startNo!=null){const found=new Set(data.map(r=>r.question_no)),missing=[];for(let n=startNo;n<=endNo;n++)if(!found.has(n))missing.push(n);if(missing.length)return json({error:`정답이 등록되지 않은 문항: ${missing.join(", ")}번`},404);}
  return data.map(r=>({no:r.question_no,answer:r.correct_answer,plus:r.is_plus}));
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"POST 요청만 지원합니다."},405);
  try{
    const body=await req.json();
    const supabase=createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if(body.type==="question"){
      const name=String(body.student_name||"").trim(),question=String(body.question||"").trim();
      if(!name||!question)return json({error:"이름과 질문 내용이 필요합니다."},400);
      if(question.length>1000)return json({error:"질문이 너무 깁니다. (1000자 이내)"},400);
      const label=body.label?String(body.label).slice(0,200):null;
      const {error}=await supabase.from("questions").insert({student_name:name,label,question});if(error)throw error;
      await notifyQuestion({student_name:name,label,question});return json({ok:true});
    }
    const student_name=typeof body.student_name==="string"?body.student_name.trim():"";
    const answers=body.answers;
    if(!student_name||!Array.isArray(answers)||!answers.length)return json({error:"이름과 답안이 필요합니다."},400);
    let keys,label,set_code=null;
    const scope={material:null,chapter:null,section:null,start_no:null,end_no:null,set_code:null};
    const p3=n=>String(n).padStart(3,"0");
    if(body.set_code){
      set_code=body.set_code;
      const {data:set,error}=await supabase.from("problem_sets").select("*").eq("set_code",set_code).single();
      if(error||!set)return json({error:"과제를 찾을 수 없습니다."},404);
      label=set.title;
      Object.assign(scope,{material:set.material||null,chapter:set.chapter||null,section:set.section||null,set_code});
      if(set.section)keys=await fetchKeys(supabase,scope,null,null);
      else if(set.chapter&&set.start_no){scope.start_no=set.start_no;scope.end_no=set.start_no+set.question_count-1;keys=await fetchKeys(supabase,scope,scope.start_no,scope.end_no);}
      else{
        const {data,error}=await supabase.from("answer_keys").select("question_no, correct_answer").eq("set_code",set_code).order("question_no",{ascending:true});
        if(error)throw error;
        if(!data||!data.length)return json({error:"과제의 정답이 아직 등록되지 않았습니다."},404);
        keys=data.map(r=>({no:r.question_no,answer:r.correct_answer,plus:false}));
      }
    }else if(body.section){
      const {material,chapter,section}=body;
      if(!material||!chapter)return json({error:"교재/단원/세트를 확인해 주세요."},400);
      Object.assign(scope,{material,chapter,section});label=`${material} ${chapter} ${section}`;
      keys=await fetchKeys(supabase,scope,null,null);
    }else{
      const material=body.material,chapter=body.chapter,startNo=Number(body.start_no),endNo=Number(body.end_no);
      if(!material||!chapter||!Number.isInteger(startNo)||!Number.isInteger(endNo)||startNo<1||endNo<startNo||endNo-startNo+1>200)return json({error:"교재/단원/범위를 확인해 주세요."},400);
      Object.assign(scope,{material,chapter,start_no:startNo,end_no:endNo});label=`${material} ${chapter} ${p3(startNo)}~${p3(endNo)}`;
      keys=await fetchKeys(supabase,scope,startNo,endNo);
    }
    if(keys instanceof Response)return keys;
    const retry=Array.isArray(body.retry_questions)&&body.retry_questions.length>0;
    if(retry){
      const want=new Set(body.retry_questions.map(Number)),sub=keys.filter(k=>want.has(k.no));
      if(sub.length!==want.size)return json({error:"재풀이 문항 번호가 올바르지 않습니다."},400);
      keys=sub;label+=" · 오답 재풀이";
    }
    if(answers.length!==keys.length)return json({error:`답안 개수(${answers.length})와 문항 수(${keys.length})가 다릅니다.`},400);
    let reasoning=null,clean=null;
    const id=crypto.randomUUID();
    const targeted=reasoningCore.isTarget(scope.material);
    const savedResponse=row=>json({score:row.score,total:row.total,wrong_questions:row.wrong_questions,plus_no:keys.find(k=>k.plus)?.no||null,submission_id:row.id,reasoning_saved:true});
    async function findDuplicate(){
      const {data,error}=await supabase.from("submissions").select("id,student_name,answers,score,total,wrong_questions,reasoning").eq("reasoning_request_id",clean.request_id).maybeSingle();
      if(error)throw error;return data;
    }
    if(targeted){
      if(answers.some(a=>!Number.isInteger(a)||a<1||a>5))return json({error:"답은 1~5 중에서 선택해 주세요."},400);
      clean=reasoningCore.input(body.reasoning,keys,retry);
      const duplicate=await findDuplicate();
      if(duplicate)return reasoningCore.sameRequest(duplicate,clean,scope,answers,student_name)?savedResponse(duplicate):json({error:"제출 식별자가 다른 답안에 사용되었습니다. 새로고침해 주세요."},409);
      let parent=null;
      if(retry){
        const {data,error}=await supabase.from("submissions").select("id,student_name,wrong_questions,reasoning").eq("id",clean.parent_id).maybeSingle();
        if(error)throw error;
        if(!data)return json({error:"이전 제출 기록을 찾지 못했습니다."},400);parent=data;
      }
      reasoning=reasoningCore.record(clean,scope,keys,answers,parent,student_name,id);
    }
    let score=0,plus_no=null;const total=keys.length,wrong_questions=[],wrong_detail=[];
    keys.forEach((k,i)=>{if(k.plus)plus_no=k.no;if(answers[i]===k.answer)score++;else{wrong_questions.push(k.no);wrong_detail.push({n:k.no,p:answers[i],a:k.answer});}});
    const part_times=cleanPartTimes(body.part_times);
    const row={id,set_code,label,student_name,answers,score,total,wrong_questions,wrong_detail,part_times};
    if(targeted){row.reasoning=reasoning;row.reasoning_request_id=clean.request_id;}
    const {error:insErr}=await supabase.from("submissions").insert(row);
    if(insErr){
      if(targeted&&insErr.code==="23505"){
        const duplicate=await findDuplicate();
        if(duplicate&&reasoningCore.sameRequest(duplicate,clean,scope,answers,student_name))return savedResponse(duplicate);
      }
      throw insErr;
    }
    // Preserve existing score notifications, but do not forward the new free-text reasons.
    await notifyDiscord({student_name,label,score,total,wrong_detail,part_times});
    return json({score,total,wrong_questions,plus_no,submission_id:id,reasoning_saved:targeted});
  }catch(err){return json({error:err.message||String(err)},err.status||500);}
});
