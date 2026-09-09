-- =====================================================================
-- 카드뉴스 주제 은행 (AI 생성) — 브랜드별 1행
-- 트리필드는 손으로 만든 lib/cardnews/topic-banks/trifield.json 을 계속 쓰고,
-- 나머지 브랜드(아카데미·누혜·비주얼살롱)는 knowledge/cardnews/concept-{브랜드}.md 를
-- 근거로 AI가 은행을 만들어 여기에 저장한다. 이후 편성은 트리필드와 똑같이
-- topic-engine 의 결정론 로테이션이 담당한다 (같은 은행 + 같은 앵커 = 같은 편성).
--
-- 은행은 파일이 아니라 DB에 두는 이유: 다시 뽑기·손수정이 배포 없이 가능해야 해서.
-- ⚠️ 배포 순서: 이 SQL을 먼저 실행한 뒤 코드를 배포할 것
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- =====================================================================

create table if not exists cardnews_topic_banks (
  branch_id uuid primary key references branches(id) on delete cascade, -- kind='brand'
  bank jsonb not null,                      -- TopicBank (sections/frames/weekday_pools/entries)
  entry_count int not null default 0,       -- 목록에서 한눈에 보려고 비정규화
  model text,                               -- 생성에 쓴 모델 (예: gemini-2.5-flash)
  note text,                                -- 생성 메모 (사람이 손댄 내역 등)
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table cardnews_topic_banks enable row level security;

-- 읽기: 본사 전체 / 그 외는 소속 지점 (cardnews_topics 와 동일 규칙)
drop policy if exists cardnews_topic_banks_read on cardnews_topic_banks;
create policy cardnews_topic_banks_read on cardnews_topic_banks for select
  using (is_hq() or branch_id in (select my_branch_ids()));

-- 쓰기: 본사만. 은행은 브랜드 전체 편성을 좌우하므로 지점 원장에게 열지 않는다.
drop policy if exists cardnews_topic_banks_write on cardnews_topic_banks;
create policy cardnews_topic_banks_write on cardnews_topic_banks for all
  using (is_hq())
  with check (is_hq());
