# 비주얼살롱 블로그 자동화 — 세팅 가이드

> 예진매니저용 세팅 안내서입니다. 위에서부터 순서대로 따라하면 됩니다.

---

## 현재 상태 (여기까지 완료됨)

- [x] GitHub 레포 생성 (`visual-afk/visual-auto`)
- [x] 코드 전체 작성 완료
- [x] Google Cloud Service Account 생성 완료
- [x] GitHub Secrets 등록 완료 (SA 이메일, 키, 시트ID, 캘린더ID, 폴더ID, Gemini키)
- [x] main 브랜치 보호 설정 완료
- [ ] **구글 시트/캘린더/Drive에 Service Account 공유** ← 여기서부터
- [ ] **구글 시트 헤더 세팅**
- [ ] **Google Cloud API 활성화 확인**
- [ ] **Google Chat Webhook 생성**
- [ ] **테스트 실행**

---

## STEP 1. 구글 리소스에 Service Account 공유하기

Service Account 이메일 (복사해서 쓰세요):
```
blog-automation@company-tasks-bot.iam.gserviceaccount.com
```

### 1-1. 구글 시트 공유

1. 이 링크 열기: https://docs.google.com/spreadsheets/d/1OMGankS1nQN1S3nTy0OM6-BbxsQK1T2T6gb4P_Y_dqQ
2. 우측 상단 **"공유"** 버튼 클릭
3. "사용자 및 그룹 추가" 입력란에 위 이메일 붙여넣기
4. 권한을 **"편집자"**로 선택
5. "알림 보내기" 체크 해제
6. **"공유"** 클릭

### 1-2. 구글 캘린더 공유

1. https://calendar.google.com 열기 (비주얼살롱 계정으로 로그인)
2. 좌측에서 블로그용 캘린더 찾기
3. 캘린더 이름 옆 **⋮** (점 3개) 클릭 → **"설정 및 공유"**
4. "특정 사용자와 공유" 섹션에서 **"사용자 추가"** 클릭
5. 위 이메일 붙여넣기
6. 권한: **"일정 변경 및 관리"**
7. **"보내기"** 클릭

### 1-3. Drive 폴더 공유

1. 이 링크 열기: https://drive.google.com/drive/folders/1pKS2ntPXL2NyDQueJiKLiDlqTPuyCHoy
2. 폴더 이름 우클릭 → **"공유"** → **"공유"**
3. 위 이메일 붙여넣기
4. 권한: **"편집자"**
5. "알림 보내기" 체크 해제
6. **"공유"** 클릭

---

## STEP 2. Google Cloud API 활성화 확인

> 이미 되어있을 수 있지만 확인 필요합니다.

1. https://console.cloud.google.com 접속 (비주얼살롱 구글 계정으로)
2. 상단에서 프로젝트 **`company-tasks-bot`** 선택
3. 아래 링크를 하나씩 열어서 **"사용"** 또는 **"관리"** 버튼이 보이는지 확인
   - 이미 "관리"라고 되어있으면 → 이미 활성화됨, 넘어가기
   - "사용"이라고 되어있으면 → 클릭해서 활성화

| API | 직접 링크 |
|-----|----------|
| Google Sheets API | https://console.cloud.google.com/apis/library/sheets.googleapis.com |
| Google Calendar API | https://console.cloud.google.com/apis/library/calendar-json.googleapis.com |
| Google Docs API | https://console.cloud.google.com/apis/library/docs.googleapis.com |
| Google Drive API | https://console.cloud.google.com/apis/library/drive.googleapis.com |

> ⚠️ 링크 열었을 때 프로젝트가 `company-tasks-bot`인지 상단에서 꼭 확인!

---

## STEP 3. 구글 시트 헤더 세팅

> 이 단계는 Claude Code로 자동 실행할 수 있습니다.

### 방법 A: Claude Code로 실행 (추천)

1. 터미널에서 이 레포 폴더로 이동
2. 아래 명령어 실행:
```bash
npx tsx scripts/setup-sheet.ts
```
3. "✅ 헤더 행 세팅 완료"가 나오면 성공

### 방법 B: 수동으로 (위 명령이 안 되면)

시트 1행에 아래 내용을 A1~M1에 입력:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 월 | 주차 | 주제 | 키워드 | 글유형 | 상태 | 예정일 | 생성일시 | 독스URL | 아임웹URL | 네이버URL | 조회수 | 전환수 |

**글유형** 칸에는 다음 중 하나를 입력합니다:
- `정보형` — 정보 전달형 글
- `스토리형` — 고객 사례/시술 스토리
- `시즌형` — 계절/트렌드 글

**상태** 칸에는 새 글 등록 시 `planned` 입력

**예정일** 형식: `2026-04-15` (YYYY-MM-DD)

---

## STEP 4. Google Chat Webhook 생성

> PR 알림을 받기 위한 설정입니다. 나중에 해도 됩니다.

1. https://chat.google.com 접속
2. 알림 받을 스페이스(채팅방) 선택 (또는 새로 만들기)
3. 스페이스 이름 클릭 → **"앱 및 통합"**
4. **"Webhook 추가"** 클릭
5. 이름: `블로그 자동화`
6. 아바타 URL: 비워도 됨
7. **"저장"** 클릭
8. 생성된 **Webhook URL** 복사 (https://chat.googleapis.com/... 형태)

### Webhook URL을 GitHub Secrets에 등록

1. https://github.com/visual-afk/visual-auto/settings/secrets/actions 접속
2. **"New repository secret"** 클릭
3. Name: `GOOGLE_CHAT_WEBHOOK_URL`
4. Secret: 위에서 복사한 URL 붙여넣기
5. **"Add secret"** 클릭

---

## STEP 5. 테스트

모든 세팅이 끝났으면 Claude Code에서 테스트합니다.

### 5-1. 레포 클론
```bash
git clone https://github.com/visual-afk/visual-auto.git
cd visual-auto
npm install
```

### 5-2. 로컬 환경변수 설정
레포 루트에 `.env` 파일을 만들고 아래 내용을 채웁니다:
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=blog-automation@company-tasks-bot.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=<Service Account JSON 파일의 private_key 값 그대로 붙여넣기>
GOOGLE_SHEET_ID=1OMGankS1nQN1S3nTy0OM6-BbxsQK1T2T6gb4P_Y_dqQ
GOOGLE_CALENDAR_ID=c_0f4cc29c24ac0d22281bb44451cc6b40f511cf34416ea7b2a228fb82013a01450@group.calendar.google.com
GOOGLE_DOCS_FOLDER_ID=1pKS2ntPXL2NyDQueJiKLiDlqTPuyCHoy
GEMINI_API_KEY=<Gemini API 키>
```

> ⚠️ `.env` 파일은 절대 Git에 올리지 마세요! (이미 .gitignore에 포함되어 있습니다)

### 5-3. 시트 헤더 세팅 실행
```bash
npx tsx scripts/setup-sheet.ts
```
→ "✅ 헤더 행 세팅 완료" + "✅ 테스트 데이터 추가 완료" 나오면 성공

### 5-4. 시트 → 캘린더 동기화 테스트
```bash
npm run sync
```
→ "캘린더 생성: 봄철 두피케어 가이드" 나오면 성공

### 5-5. 이번주 일정 확인
```bash
npm run schedule
```

---

## 문제가 생기면?

### "The caller does not have permission" 에러
→ STEP 1에서 시트/캘린더/Drive에 Service Account 이메일 공유를 안 한 것입니다. 다시 확인하세요.

### "환경변수 ___가 설정되지 않았습니다" 에러
→ `.env` 파일이 없거나 값이 비어있습니다. STEP 5-2를 다시 확인하세요.

### "API has not been enabled" 에러
→ STEP 2에서 해당 API를 활성화하지 않은 것입니다. Google Cloud Console에서 활성화하세요.

### "시트1" 관련 에러
→ 구글 시트의 탭 이름이 "시트1"이 맞는지 확인하세요. 다른 이름이면 `lib/config.ts`의 `SHEET_RANGE` 값을 수정해야 합니다.

### Claude Code에서 도움받기
이 레포를 클론한 후 Claude Code에서 질문하면 `CLAUDE.md`를 읽고 도와줍니다:
- "시트 동기화 해줘"
- "블로그 글 생성 해줘"
- "이번주 일정 확인해줘"

---

## 세팅 완료 후 작업 흐름

1. **구글시트에 주제 등록** — 월, 주차, 주제, 키워드, 글유형, 상태(`planned`), 예정일 입력
2. **자동 동기화** — 매일 9시에 자동으로 캘린더에 반영됨 (수동: `npm run sync`)
3. **AI 글 생성** — 월/수/금 10시에 자동 생성됨 (수동: `npm run generate`)
4. **구글독스에서 검토** — 시트의 독스URL 클릭 → 글 확인 → 사진 추가
5. **아임웹 + 네이버 블로그에 발행** — 수동
6. **시트에 발행 URL 기록** — 아임웹URL, 네이버URL 칸에 입력, 상태를 `published`로 변경
