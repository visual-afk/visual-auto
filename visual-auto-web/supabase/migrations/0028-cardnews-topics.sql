-- =====================================================================
-- 카드뉴스 주제 편성 (모발 뉴스데스크): 브랜드별 일일 주제 캘린더
-- 크론이 은행(lib/cardnews/topic-banks/*.json)에서 결정론적으로 시드하고,
-- 사용자가 콘텐츠 캘린더에서 수정한다. 시드는 append-only — 수정이 항상 이긴다.
-- ⚠️ 배포 순서: 이 SQL을 먼저 실행한 뒤 코드를 배포할 것
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- =====================================================================

create table if not exists cardnews_topics (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade, -- kind='brand' 지점 (트리필드 등)
  topic_date date not null,                 -- KST 편성일
  entry_id text,                            -- 은행 항목 id (예: D06-03), 수동 추가면 null
  section text not null default '',         -- 면 (예: 'D06 제품·성분')
  pool_label text,                          -- 요일 지면 (예: '성분·제품의 날')
  material text not null,                   -- 소재
  frame text not null default '',           -- 뉴스 프레임 (예: 'F1 수치화')
  fact_seed text,                           -- 팩트 시드 (근거 경계)
  hint text,                                -- 표지 훅 힌트
  headline_draft text,                      -- 사용자 헤드라인 초안
  bubble text,                              -- 사용자 말풍선 대사
  verify_needed boolean not null default false,  -- 은행에서 팩트 확정 필요 표시
  fact_confirmed boolean not null default false, -- 사용자가 확인 완료 체크
  live_slot boolean not null default false, -- 라이브 슬롯 (신제품·트렌드로 교체 가능)
  -- 제작 파이프라인 상태: 기획중 → 레퍼런스 → 촬영완료 → 업로드완료 (+건너뜀)
  status text not null default 'planning' check (status in ('planning','reference','filmed','uploaded','skipped')),
  memo text,
  reference_url text,                       -- 릴스 등 레퍼런스 영상 링크 (기획 참고용)
  card_news_id uuid references card_news(id) on delete set null, -- 이 주제로 만든 카드뉴스
  gcal_event_id text,                       -- 구글캘린더 내보내기 결과 (없으면 미전송)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, topic_date)            -- 하루 한 브랜드 한 주제 (append-only 시드의 기준)
);
create index if not exists cardnews_topics_branch_date_idx
  on cardnews_topics(branch_id, topic_date);

alter table cardnews_topics enable row level security;
-- 읽기: 본사 전체 / 그 외는 소속 지점 (0016 content_schedule 과 동일)
drop policy if exists cardnews_topics_read on cardnews_topics;
create policy cardnews_topics_read on cardnews_topics for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists cardnews_topics_write on cardnews_topics;
create policy cardnews_topics_write on cardnews_topics for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- 콘텐츠 일정(계획)에도 레퍼런스 영상 링크 — 기획할 때 릴스 레퍼런스를 함께 저장
alter table content_schedule add column if not exists reference_url text;

-- 콘텐츠 일정 유형에 '카드뉴스' 추가 (기획 짜기·일정 추가에서 선택 가능)
alter table content_schedule drop constraint if exists content_schedule_content_type_check;
alter table content_schedule add constraint content_schedule_content_type_check
  check (content_type in ('blog','reels','cardnews','etc'));

-- ── 방어 블록: 이 파일의 이전 버전(status planned/done/skipped)을 이미 실행했던 경우 ──
-- 새로 실행하는 경우엔 위 create table 이 이미 새 상태값을 쓰므로 아래는 사실상 no-op (idempotent)
alter table cardnews_topics add column if not exists reference_url text;
alter table cardnews_topics drop constraint if exists cardnews_topics_status_check;
update cardnews_topics set status = 'planning' where status = 'planned';
update cardnews_topics set status = 'uploaded' where status = 'done';
alter table cardnews_topics alter column status set default 'planning';
alter table cardnews_topics add constraint cardnews_topics_status_check
  check (status in ('planning','reference','filmed','uploaded','skipped'));
