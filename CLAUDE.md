# 비주얼살롱 블로그 자동화

비주얼살롱(미용실)의 블로그 콘텐츠를 AI로 자동 생성하고, 구글 워크스페이스로 관리하는 시스템.
예진매니저(실무자)가 기획하고, AI가 글을 쓰고, 예진매니저가 사진 추가 후 발행한다.

## Quick Commands

```bash
npm run sync        # 구글시트 → 캘린더 동기화
npm run generate    # AI 블로그 글 생성 (오늘 예정된 주제)
npm run generate -- --topic "봄철 두피케어"  # 특정 주제로 생성
npm run schedule    # 이번주 일정 확인
npm run report      # GA4 성과 리포트
```

## Knowledge System (SSOT 지식베이스)

`knowledge/` 폴더에 3개 필라의 마크다운 파일이 있다. **블로그 글을 생성하기 전에 반드시 해당 knowledge/ 파일을 모두 읽어야 한다.**

### 필라 구조
- `knowledge/seo/` — SEO 전략, 키워드, 네이버 SEO 규칙
- `knowledge/brand/` — 비주얼살롱 브랜드 보이스, 서비스, 전문성
- `knowledge/consumer/` — 소비자 심리, 페르소나, 의사결정 여정

이 파일들은 예진매니저가 작성하고 관리한다. AI는 이 지식을 기반으로 글을 생성한다.

## Blog Generation Pipeline

1. **주제 결정**: CLI `--topic` 인자 또는 구글시트에서 `status=planned` 행 조회
2. **지식 로딩**: `knowledge/` 전체 .md 파일 읽어서 컨텍스트 조합
3. **템플릿 선택**: 시트의 `post_type` 컬럼에 따라 `templates/` 에서 선택
   - `정보형` → templates/info-post.md
   - `스토리형` → templates/story-post.md
   - `시즌형` → templates/seasonal-post.md
4. **시스템 프롬프트**: `prompts/blog-writer.md` 로딩
5. **Claude API 호출**: 지식 + 템플릿 + 주제 → 초안 생성
6. **SEO 최적화**: `prompts/seo-optimizer.md`로 2차 패스
7. **구글독스 생성**: Drive 폴더에 새 문서 생성
8. **시트 업데이트**: status → `draft_ready`, doc_url 기록
9. **로그**: `status/pipeline-log.jsonl`에 기록

## Git 협업 규칙

### 브랜치 전략
- `main` — 안정 브랜치. **직접 push/merge 금지**
- `yejin/*` — 예진매니저 작업 브랜치 (예: `yejin/update-brand-voice`, `yejin/add-april-keywords`)
- 예진매니저는 항상 `yejin/` 브랜치에서 작업하고 PR을 생성한다
- PR 생성/변경 시 Google Chat으로 알림이 간다

### 예진매니저 작업 흐름
```bash
git checkout -b yejin/작업내용    # 새 브랜치 생성
# knowledge/, prompts/ 파일 수정
git add .
git commit -m "update: 브랜드 보이스 수정"
git push origin yejin/작업내용
# → GitHub에서 PR 생성 → Google Chat 알림 → 대표 확인 후 머지
```

### Google Chat 알림
- PR 생성/업데이트 시 Google Chat webhook으로 자동 알림
- `GOOGLE_CHAT_WEBHOOK_URL` 환경변수 (GitHub Secrets)에 설정

## Architecture Rules

- TypeScript + ESM (`tsx`로 직접 실행, 빌드 불필요)
- 웹 프레임워크 없음 — 스크립트 기반
- 구글 Service Account로 API 인증
- Anthropic SDK로 Claude API 직접 호출
- DB 없음 — 구글시트가 상태 관리의 메인
- GitHub Actions로 cron 자동화

## Google Workspace 연동

### 구글시트 스키마 (기획서)

| 컬럼 | 설명 |
|------|------|
| month | 월 (예: 2026-04) |
| week | 주차 (1~5) |
| topic | 주제 |
| keywords | 키워드 (쉼표 구분) |
| post_type | 글유형: 정보형/스토리형/시즌형 |
| status | planned/generating/draft_ready/reviewing/published/tracking |
| scheduled_date | 예정일 (YYYY-MM-DD) |
| generated_at | 생성 완료 시각 |
| doc_url | 구글독스 URL |
| imweb_url | 아임웹 발행 URL |
| naver_url | 네이버 블로그 URL |
| views | 조회수 |
| conversions | 전환수 |

### 상태 흐름
```
planned → generating → draft_ready → reviewing → published → tracking
```

### 캘린더 연동
- 시트의 각 행이 캘린더 이벤트로 생성됨
- 이벤트 제목: `[블로그] {주제}`
- 이벤트 설명: 키워드, 글유형, 독스 URL

### 독스 출력
- 지정된 Drive 폴더에 새 문서 생성
- 제목: `[비주얼살롱] {글 제목} - {날짜}`

## Publishing Workflow

1. AI가 구글독스에 글 작성 완료 → 시트 status가 `draft_ready`로 변경
2. 예진매니저가 구글독스 열어서 검토
3. 사진 촬영/편집 후 독스에 추가
4. 아임웹 + 네이버 블로그에 수동 발행
5. 발행 URL을 시트에 기록 → status를 `published`로 변경

## Status Tracking

- **메인 대시보드**: 구글시트 자체 (예진매니저가 항상 보는 곳)
- **디버깅 로그**: `status/pipeline-log.jsonl` (append-only JSONL)
  ```json
  {"timestamp":"2026-04-09T10:00:00Z","topic":"봄철 두피케어","status":"completed","doc_url":"https://docs.google.com/...","tokens_used":3500,"duration_ms":12000}
  ```

## 환경변수

| 변수 | 설명 |
|------|------|
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Service Account 이메일 |
| GOOGLE_PRIVATE_KEY | Service Account 비공개 키 (PEM) |
| GOOGLE_SHEET_ID | 기획서 시트 ID |
| GOOGLE_CALENDAR_ID | 캘린더 ID |
| GOOGLE_DOCS_FOLDER_ID | 독스 출력 Drive 폴더 ID |
| GA4_PROPERTY_ID | GA4 속성 ID (추적 방식 변경 가능) |
| ANTHROPIC_API_KEY | Anthropic API 키 |
| GOOGLE_CHAT_WEBHOOK_URL | Google Chat 알림 webhook URL |

## GitHub Actions (자동화)

| Workflow | 스케줄 | 동작 |
|----------|--------|------|
| sync-calendar | 매일 09:00 KST | 시트→캘린더 동기화 |
| generate-posts | 월/수/금 10:00 KST | 예정 주제 AI 생성 |
| weekly-report | 일 21:00 KST | GA4 주간 리포트 |

## 예진매니저 가이드

### knowledge/ 파일 작성법

각 파일은 마크다운(.md)으로 작성합니다. AI가 글을 쓸 때 이 파일들을 참고하므로, 구체적이고 실제적인 내용을 써주세요.

**seo/keyword-strategy.md** — 타겟 키워드 목록
```markdown
## 메인 키워드
- 강남 미용실, 강남 헤어살롱, ...

## 서비스별 키워드
### 커트
- 여자 커트 잘하는 곳, 레이어드컷 추천, ...
```

**brand/brand-voice.md** — 비주얼살롱의 말투와 분위기
```markdown
## 톤
- 전문적이지만 따뜻한 톤
- 존댓말 사용 (~합니다, ~해요 혼용 OK)

## 절대 하지 않는 것
- 과장된 광고 문구
- 경쟁사 비하
```

**consumer/personas.md** — 우리 고객은 누구인가
```markdown
## 페르소나 1: 직장인 A씨 (30대 여성)
- 바쁜 일정, 빠른 시술 선호
- 인스타그램에서 정보 수집
- 결정 포인트: 후기, 포트폴리오 사진
```

### 프롬프트 수정법

`prompts/` 폴더의 파일을 수정하면 AI의 글쓰기 스타일이 바뀝니다.
- `blog-writer.md` — 글의 전체 톤과 구조
- `seo-optimizer.md` — SEO 최적화 기준
- `title-generator.md` — 제목 스타일
