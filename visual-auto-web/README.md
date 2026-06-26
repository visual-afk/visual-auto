# 비주얼 블로그 (visual-auto-web)

비주얼살롱 **디자이너 셀프서비스** 웹앱. 디자이너가 로그인 → 오늘 시술 기록 입력 →
AI가 추천 주제와 어우러진 블로그 글 + 촬영 가이드 작성 → 네이버/아임웹에 복사·발행 → 조회수 기록.

> 기존 `visual-auto/` (예진매니저 운영용 스크립트/시트/캘린더)는 그대로 두고, 그 위에 얹는 디자이너용 앱입니다.

## 핵심 특징
- **초대 링크 전용 가입** (공개가입 차단). 원장/실장이 보낸 링크로만 가입, 지점 자동 설정.
- **권한 3종**: 본사(hq_admin) / 지점 원장(branch_owner) / 디자이너(designer).
- **아이디(휴대폰)+비번 로그인** (이메일 불필요). 휴대폰으로 동명이인 구분.
- **라이트 모드, 모바일+데스크톱 반응형** (모바일 하단탭 / 데스크톱 사이드바).
- **반자동 발행**: 본문 복사 + 사진 갤러리 저장 → 네이버/아임웹 열어 붙여넣기 (자동발행 X).
- **조회수 직접 입력** + "3일 뒤" 인앱 리마인드.
- **추천 주제는 `knowledge/seo/topic-rules.md`** 한 파일로 관리 (예진매니저가 코드 없이 수정).

## 셋업

### 1) Supabase
1. Supabase 프로젝트 생성
2. SQL Editor에 [`supabase/schema.sql`](supabase/schema.sql) 붙여넣고 실행 (테이블·RLS·스토리지)

### 2) 환경변수
`.env.example` → `.env` 복사 후 채우기:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...           # 또는 GEMINI_API_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3) 시드 (지점 5개 + 본사 + 지점 원장)
```bash
npm install
npm run seed
```
출력된 계정으로 로그인 (예: `hq` / 원장 `owner1`~`owner5`, 비번 `visual1234`).

### 4) 실행
```bash
npm run dev   # http://localhost:3000
```

## Vercel 배포
1. 이 `visual-auto-web/` 폴더를 Vercel 프로젝트로 임포트 (Root Directory = `visual-auto-web`)
2. **Environment Variables** 에 아래 등록 (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (또는 `GEMINI_API_KEY`)
   - `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=visual.local`
   - `NEXT_PUBLIC_APP_URL` 은 **안 넣어도 됨** (초대 링크는 접속한 도메인에서 자동 생성).
     커스텀 도메인을 쓸 때만 그 주소를 넣으세요.
3. 시드는 로컬에서 한 번만 실행하면 됩니다 (`npm run seed` — 같은 Supabase를 바라봄).

> 초대 링크는 요청이 들어온 도메인 기준으로 만들어지므로, 프로덕션에서 만든 링크는 프로덕션 주소로 나갑니다.

## 사용 흐름
1. **원장 로그인** → 멤버 관리 → 디자이너 초대 → 링크를 카톡/문자로 전달
2. **디자이너**: 링크 열기 → 이름·휴대폰·비번 입력 → 가입 (지점 자동)
3. **글쓰기**: 시술 칩 + 기록 + 사진 → 추천 주제 선택 → AI 초안 → 촬영 가이드 확인
4. **발행**: [네이버 블로그 열기] = 본문 복사 + 사진 저장 + 네이버 열기 → 붙여넣기
5. **성과**: 발행 URL·조회수 입력 → "내 글·조회수"에서 추적

## 구조
```
app/
  login/                 로그인 (아이디+비번)
  invite/[token]/        초대 수락 가입
  (app)/
    page.tsx             홈 (인사·지난 글)
    write/               글쓰기 스튜디오 (입력 + AI 초안 + 발행)
    track/               내 글·조회수 (목록)
    track/[id]/          조회수 입력
    members/             멤버 관리·초대 (원장/본사)
  api/                   invites · recommend-topics · generate · posts
lib/
  supabase/  auth.ts  generation/{ai-client,photo-guide}
knowledge/ prompts/ templates/   ← visual-auto에서 동봉 (서버 fs 읽기)
  knowledge/seo/topic-rules.md    ← 예진매니저가 관리하는 추천 규칙
```

## 추후 (Phase 4, 미구현)
자동발행 · 자동 조회수 수집 · 음성 기록(STT) · 푸시 알림 · 사진 스토리지 호스팅 · 본사 관리자 대시보드.
