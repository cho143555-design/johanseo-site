// supabase/functions/grade/index.ts
//
// 학생이 답을 제출하면 이 함수가:
//  1) service_role 키로 정답표(answer_keys)를 조회 (RLS 우회 — 서버 안에서만 실행되므로 안전)
//  2) 학생 답과 비교해서 채점
//  3) submissions 테이블에 기록 저장
//  4) 점수 결과만 학생에게 돌려줌 (정답 자체는 절대 내려주지 않음)
//
// 배포: supabase functions deploy grade

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { set_code, student_name, answers } = await req.json();

    if (!set_code || !student_name || !Array.isArray(answers)) {
      return new Response(
        JSON.stringify({ error: "set_code, student_name, answers(배열)가 모두 필요합니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 정답표 조회 (service_role이므로 RLS와 무관하게 조회 가능)
    const { data: keyRows, error: keyError } = await supabase
      .from("answer_keys")
      .select("question_no, correct_answer")
      .eq("set_code", set_code)
      .order("question_no", { ascending: true });

    if (keyError) throw keyError;
    if (!keyRows || keyRows.length === 0) {
      return new Response(
        JSON.stringify({ error: `'${set_code}' 학습지의 정답이 아직 등록되지 않았습니다.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const total = keyRows.length;
    let score = 0;
    const wrong_questions: number[] = [];

    for (const row of keyRows) {
      const studentAnswer = answers[row.question_no - 1];
      if (studentAnswer === row.correct_answer) {
        score += 1;
      } else {
        wrong_questions.push(row.question_no);
      }
    }

    const { error: insertError } = await supabase.from("submissions").insert({
      set_code,
      student_name,
      answers,
      score,
      total,
      wrong_questions,
    });
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ score, total, wrong_questions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
