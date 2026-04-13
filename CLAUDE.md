# 비주얼살롱 블로그 자동화

비주얼살롱(미용실)의 블로그를 AI로 자동 생성하는 시스템.
**예진매니저(실무자)가 Claude Code에서 한국어로 말하면 모든 것이 처리된다.**

## 예진매니저 요청 → 실행 매핑

예진매니저가 아래처럼 말하면, 해당 동작을 수행한다.

### 일정/기획
| 예진매니저가 말하는 것 | Claude Code가 할 것 |
|----------------------|-------------------|
| "이번주 일정 보여줘" | `npm run schedule` 실행 |
| "시트 캘린더에 반영해줘" | `npm run sync` 실행 |
| "4월 기획서 넣어줘" + 주제 목록 | `lib/google-sheets.ts`의 Sheets API로 행 추가 |
| "새 글 주제 추가해줘" + 주제/키워드/유형/날짜 | 시트에 `planned` 상태로 행 추가 |

### 글 생성
| 예진매니저가 말하는 것 | Claude Code가 할 것 |
|----------------------|-------------------|
| "블로그 글 써줘" / "오늘 글 생성해줘" | `npm run generate` 실행 |
| "봄철 두피케어 글 써줘" | `npm run generate -- --topic "봄철 두피케어"` 실행 |
| "이 글 다시 써줘" | 시트 상태를 `planned`로 되돌린 후 `npm run generate` |

### 지식베이스 관리
| 예진매니저가 말하는 것 | Claude Code가 할 것 |
|----------------------|-------------------|
| "브랜드 보이스 수정할래" | `knowledge/brand/brand-voice.md` 읽고 수정 |
| "키워드 추가해줘" | `knowledge/seo/keyword-master.md`에 추가 |
| "서비스 메뉴 업데이트해줘" | `knowledge/brand/services-menu.md` 수정 |
| "고객 사례 추가해줘" | `knowledge/brand/case-studies.md`에 추가 |
| "CTA 패턴 초안 써줘" | `knowledge/consumer/cta-patterns.md` AI가 초안 작성 |

### 발행 기록
| 예진매니저가 말하는 것 | Claude Code가 할 것 |
|----------------------|-------------------|
| "글 발행했어. URL은 ..." | 시트에 URL 기록 + 상태를 `published`로 변경 |
| "성과 보여줘" | `npm run report` 실행 |

### Git 작업
| 예진매니저가 말하는 것 | Claude Code가 할 것 |
|----------------------|-------------------|
| "수정한 거 올려줘" / "PR 올려줘" | `yejin/*` 브랜치 생성 → 커밋 → push → PR 생성 |

**Git 규칙**: 예진매니저의 모든 변경은 `yejin/*` 브랜치에서 한다. main 직접 수정 금지. Claude Code가 브랜치/커밋/PR을 전부 처리한다.

---

## Knowledge System (뇌)

`knowledge/` 폴더에 15개 마크다운 파일이 있다. **블로그 글을 생성하기 전에 반드시 전체 knowledge/ 파일을 읽어야 한다.**

### 뇌1: SEO 전략 — `knowledge/seo/`
- `naver-seo-rules.md` — 네이버 블로그 SEO 규칙
- `keyword-master.md` — 서비스별 메인/롱테일 키워드
- `keyword-seasonal.md` — 시즌별 키워드
- `search-intent.md` — 키워드→검색의도 매핑
- `competitor-gaps.md` — 경쟁사 분석, 틈새 주제

### 뇌2: 미용전문성 + 브랜딩 — `knowledge/brand/`
- `salon-identity.md` — 살롱 소개, 위치, 분위기, 차별점
- `brand-voice.md` — 톤앤매너, 말투, 좋은/나쁜 문장 예시
- `services-menu.md` — 전 서비스 + 가격 + 과정 + 시간
- `staff-expertise.md` — 디자이너별 전문분야
- `product-lines.md` — 사용 제품, 선택 이유
- `case-studies.md` — 비포/애프터 사례, 고객 후기

### 뇌3: 소비자 심리 — `knowledge/consumer/`
- `personas.md` — 타겟 고객 페르소나
- `pain-points.md` — 고객 불안/고민
- `desire-triggers.md` — 예약 유발 감정
- `decision-journey.md` — 검색→비교→예약 여정
- `cta-patterns.md` — 예약 유도 문구 패턴

---

## Blog Generation Pipeline

1. **주제 결정**: CLI `--topic` 인자 또는 시트에서 `status=planned` 행 조회
2. **지식 로딩**: `knowledge/` 전체 .md 파일 읽어서 컨텍스트 조합
3. **템플릿 선택**: 시트의 `post_type`에 따라 선택
   - `정보형` → `templates/info-post.md`
   - `스토리형` → `templates/story-post.md`
   - `시즌형` → `templates/seasonal-post.md`
4. **시스템 프롬프트**: `prompts/blog-writer.md` 로딩
5. **AI 호출**: 지식 + 템플릿 + 주제 → 초안 생성
6. **SEO 최적화**: `prompts/seo-optimizer.md`로 2차 패스
7. **구글독스 생성**: Drive 폴더에 새 문서
8. **시트 업데이트**: status → `draft_ready`, doc_url 기록
9. **캘린더 업데이트**: 이벤트 설명에 독스 링크 추가
10. **로그**: `status/pipeline-log.jsonl`에 기록

---

## 구글시트 스키마

| 컬럼 | 설명 |
|------|------|
| month | 월 (예: 2026-04) |
| week | 주차 (1~5) |
| topic | 주제 |
| keywords | 키워드 (쉼표 구분) |
| post_type | 정보형 / 스토리형 / 시즌형 |
| status | planned → generating → draft_ready → reviewing → published → tracking |
| scheduled_date | 예정일 (YYYY-MM-DD) |
| generated_at | 생성 완료 시각 |
| doc_url | 구글독스 URL |
| imweb_url | 아임웹 발행 URL |
| naver_url | 네이버 블로그 URL |
| views | 조회수 |
| conversions | 전환수 |

시트 이름: `시트1`, 범위: `A2:M` (1행은 헤더)

---

## 캘린더 연동

- 시트의 각 행이 캘린더 이벤트로 생성/업데이트됨
- 이벤트 제목: `[블로그] {주제}`
- 이벤트 설명에 포함: 키워드, 글유형, 상태, **독스 URL**
- 예진매니저는 캘린더에서 날짜 클릭 → 독스 링크로 바로 이동

---

## Scripts

| 명령어 | 스크립트 | 동작 |
|--------|---------|------|
| `npm run schedule` | `scripts/check-schedule.ts` | 이번주 일정 표시 |
| `npm run sync` | `scripts/sync-sheets-to-calendar.ts` | 시트→캘린더 동기화 |
| `npm run generate` | `scripts/generate-blog-post.ts` | AI 블로그 생성 |
| `npm run generate -- --topic "주제"` | 위와 동일 | 특정 주제 생성 |
| `npm run report` | `scripts/fetch-ga4-report.ts` | 성과 리포트 |
| `npx tsx scripts/setup-sheet.ts` | 시트 헤더 초기 세팅 | 최초 1회만 |

---

## GitHub Actions (자동화)

| Workflow | 스케줄 | 동작 |
|----------|--------|------|
| sync-calendar | 매일 09:00 KST | 시트→캘린더 동기화 |
| generate-posts | 월/수/금 10:00 KST | 예정 주제 AI 생성 |
| weekly-report | 일 21:00 KST | 주간 리포트 |
| notify-pr | PR 생성시 | Google Chat 알림 |

---

## Architecture

- TypeScript + ESM (`tsx`로 직접 실행)
- AI: Gemini 2.0 Flash 우선, Anthropic Claude 폴백 (`lib/ai-client.ts`)
- Google: Service Account JWT 인증 (`lib/google-auth.ts`)
- DB 없음 — 구글시트가 상태 관리
- GitHub Actions로 cron 자동화

## 환경변수

| 변수 | 설명 |
|------|------|
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Service Account 이메일 |
| GOOGLE_PRIVATE_KEY | Service Account 비공개 키 |
| GOOGLE_SHEET_ID | 기획서 시트 ID |
| GOOGLE_CALENDAR_ID | 캘린더 ID |
| GOOGLE_DOCS_FOLDER_ID | 독스 출력 Drive 폴더 ID |
| GEMINI_API_KEY | Gemini API 키 |
| ANTHROPIC_API_KEY | Anthropic API 키 (선택) |
| GA4_PROPERTY_ID | GA4 속성 ID (선택, 추적 방식 변경 가능) |
| GOOGLE_CHAT_WEBHOOK_URL | Google Chat 알림 webhook URL |
