# 조한서 국어과외 — 채점 사이트 셋업 가이드

프로필 + 숙제 자동채점을 하나로 묶은 사이트입니다. 정답은 **서버(Edge Function)에서만** 대조되므로
학생 브라우저로는 정답을 볼 수 없습니다. 학습지가 몇 개가 되든 화면은 그대로 재사용됩니다.

## 구성
- `public/index.html` — 프로필(소개·후기·카톡 문의)
- `public/grade.html` — 학생용 채점(목록 선택 → OMR 입력 → 점수+틀린 문항)
- `public/admin.html` — 관리자(로그인 후 학습지·정답 등록, 제출기록 조회)
- `public/style.css`, `public/config.js` — 공통 스타일·설정
- `supabase/schema.sql` — DB 테이블 + 보안(RLS)
- `supabase/functions/grade/index.ts` — 채점 서버

---

## 1. Supabase 프로젝트 만들기 (무료)
1. supabase.com 가입 → New Project (리전은 **Seoul** 권장)
2. 좌측 **SQL Editor** → `supabase/schema.sql` 전체 붙여넣고 **Run**
3. **Project Settings → API** 에서 두 값 복사:
   - Project URL
   - anon(publishable) key
4. `public/config.js` 의 두 줄을 위 값으로 교체
   - ※ anon 키는 공개돼도 안전한 키입니다. **service_role 키는 절대 넣지 마세요.**

## 2. 채점 함수 배포
Supabase CLI 설치 후:
```
supabase login
supabase link --project-ref <프로젝트-ref>
supabase functions deploy grade
```
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 배포 환경에 자동 주입되므로 따로 설정할 필요 없습니다.

## 3. 관리자 계정 만들기
Supabase 대시보드 → **Authentication → Users → Add user** 로 본인 이메일/비밀번호 생성.
이 계정으로 `admin.html`에서 로그인하면 학습지·정답을 등록할 수 있습니다.

## 4. 카카오톡 채널 연결
`index.html`의 `KAKAO_CHANNEL_URL` 을 실제 채널 주소(예: `http://pf.kakao.com/_XXXXX`)로 교체.

## 5. 배포 (무료)
GitHub에 올린 뒤 **Vercel** 또는 **Cloudflare Pages**로 연결하면 끝.
- 이 사이트는 정적 파일이라 어디든 무료 티어로 충분합니다.
- ⚠️ Vercel Hobby(무료)는 약관상 **비상업적** 용도로 제한됩니다. 과외는 수익 활동이므로
  Vercel을 쓴다면 Pro($20/월)가 안전하고, **Cloudflare Pages는 무료로 상업적 사용이 가능**해
  시작 단계에선 Cloudflare Pages를 권합니다. (요금·약관은 바뀔 수 있으니 배포 전 각 사이트에서 확인하세요.)

---

## 새 숙제 낼 때 (반복 작업)
`admin.html` 로그인 → 코드·제목·문항수 입력 → 정답 표기 → 등록. 몇십 초면 끝.
학생은 `grade.html`에서 목록에 새로 뜬 학습지를 골라 바로 채점받습니다.

## 보안 요약
- `answer_keys`(정답)와 `submissions`(기록)는 RLS로 **anon 조회 차단** → 학생은 정답을 못 봅니다.
- 채점은 service_role 권한을 가진 Edge Function만 수행 → 점수 조작 불가.
- 학생 화면에는 **점수와 틀린 문항 번호만** 반환됩니다(정답 미노출).
