-- =====================================================================
-- 콘텐츠 캘린더: 예정 콘텐츠(계획) 일정
-- 계획 레이어는 이 테이블, 실적 레이어는 posts/reels 를 그대로 그린다.
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- =====================================================================

create table if not exists content_schedule (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  content_type text not null default 'blog' check (content_type in ('blog','reels','etc')),
  title text not null,                      -- 주제/제목
  scheduled_date date not null,             -- KST 기준 예정일
  assignee_id uuid references branch_users(id) on delete set null,  -- 담당자(선택)
  status text not null default 'planned' check (status in ('planned','done','canceled')),
  memo text,
  post_id uuid references posts(id) on delete set null,   -- 완료 처리 시 발행물 수동 연결(선택)
  reel_id uuid references reels(id) on delete set null,
  gcal_event_id text,                       -- 구글캘린더 내보내기 결과 (없으면 미전송)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_schedule_branch_date_idx
  on content_schedule(branch_id, scheduled_date);

alter table content_schedule enable row level security;
-- 읽기: 본사 전체 / 그 외는 소속 지점 (디자이너·인턴은 조회만 — 쓰기 정책에서 제외)
drop policy if exists content_schedule_read on content_schedule;
create policy content_schedule_read on content_schedule for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists content_schedule_write on content_schedule;
create policy content_schedule_write on content_schedule for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));
