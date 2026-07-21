-- ============================================================
-- 조한서 국어과외 채점 시스템 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run 하면 됩니다.
-- ============================================================

-- 1) 학습지(문제 세트) 메타데이터 — 학생도 볼 수 있는 "공개" 정보
--    (정답은 여기 없음. 문항 수/제목만 있어서 채점 화면에 몇 문제를 보여줄지 결정하는 용도)
create table if not exists problem_sets (
  set_code      text primary key,          -- 예: 'igam20-doksu-1'
  title         text not null,             -- 예: '이감 20호 독서 1회'
  material      text not null,             -- 예: '이감'
  category      text not null,             -- '독서' | '문학'
  question_count int not null check (question_count > 0),
  choice_count  int not null default 5,    -- 몇지선다인지 (기본 5)
  created_at    timestamptz not null default now()
);

-- 2) 정답표 — 절대 학생(anon)에게 노출되면 안 되는 "비공개" 정보
create table if not exists answer_keys (
  id             uuid primary key default gen_random_uuid(),
  set_code       text not null references problem_sets(set_code) on delete cascade,
  question_no    int not null,
  correct_answer int not null,
  unique (set_code, question_no)
);

-- 3) 제출/채점 기록
create table if not exists submissions (
  id              uuid primary key default gen_random_uuid(),
  set_code        text not null references problem_sets(set_code) on delete cascade,
  student_name    text not null,
  answers         jsonb not null,          -- 학생이 낸 답 [1,3,2,4,5, ...]
  score           int not null,
  total           int not null,
  wrong_questions jsonb not null,          -- 틀린 문항 번호 [3, 7]
  created_at      timestamptz not null default now()
);

-- ============================================================
-- RLS (행 수준 보안) — 반드시 켜야 함
-- ============================================================
alter table problem_sets enable row level security;
alter table answer_keys  enable row level security;
alter table submissions  enable row level security;

-- problem_sets: 학생(anon)도 목록/문항수는 볼 수 있어야 채점 화면을 그릴 수 있음
create policy "누구나 학습지 목록 조회" on problem_sets
  for select using (true);

-- problem_sets: 등록/수정/삭제는 로그인한 사람(=너)만
create policy "로그인 사용자만 학습지 등록" on problem_sets
  for insert with check (auth.role() = 'authenticated');
create policy "로그인 사용자만 학습지 수정" on problem_sets
  for update using (auth.role() = 'authenticated');
create policy "로그인 사용자만 학습지 삭제" on problem_sets
  for delete using (auth.role() = 'authenticated');

-- answer_keys: anon에게는 select 정책 자체를 만들지 않음 → 학생은 절대 정답을 못 봄
--              (채점은 정답을 우회 조회할 수 있는 Edge Function이 처리)
create policy "로그인 사용자만 정답 조회" on answer_keys
  for select using (auth.role() = 'authenticated');
create policy "로그인 사용자만 정답 등록" on answer_keys
  for insert with check (auth.role() = 'authenticated');
create policy "로그인 사용자만 정답 수정" on answer_keys
  for update using (auth.role() = 'authenticated');
create policy "로그인 사용자만 정답 삭제" on answer_keys
  for delete using (auth.role() = 'authenticated');

-- submissions: anon insert 정책도 만들지 않음 → 학생이 직접 점수를 조작해서 넣는 것 방지
--              (기록 삽입은 Edge Function이 service_role로 대신 처리)
create policy "로그인 사용자만 제출기록 조회" on submissions
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- 참고: 정답을 직접 입력할 때는 admin.html에서 로그인 후 입력하거나,
-- 아래처럼 SQL Editor에서 바로 넣어도 됩니다.
--
-- insert into problem_sets (set_code, title, material, category, question_count)
-- values ('igam20-doksu-1', '이감 20호 독서 1회', '이감', '독서', 6);
--
-- insert into answer_keys (set_code, question_no, correct_answer) values
-- ('igam20-doksu-1', 1, 3), ('igam20-doksu-1', 2, 1), ('igam20-doksu-1', 3, 4),
-- ('igam20-doksu-1', 4, 2), ('igam20-doksu-1', 5, 5), ('igam20-doksu-1', 6, 3);
-- ============================================================
