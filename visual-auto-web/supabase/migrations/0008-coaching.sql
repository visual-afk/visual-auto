-- =====================================================================
-- 원장 코칭 대시보드: 저장 수(저장률) + 리뷰 답글 사용 로그
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

-- ── 저장 수(인스타 '저장'/네이버 '저장') — 저장률 = saves / views ──
alter table reels add column if not exists saves int;
alter table posts add column if not exists saves int;

-- ── 리뷰 답글 사용 로그 ──
-- 리뷰 답글은 DB에 저장하지 않는다(프라이버시). 코칭 카운트용으로 "사용 시점" 이벤트만 남긴다.
-- 답글 텍스트·고객 리뷰 원문은 저장하지 않는다.
create table if not exists review_reply_logs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists review_reply_logs_branch_idx on review_reply_logs(branch_id);
create index if not exists review_reply_logs_author_idx on review_reply_logs(author_id);
create index if not exists review_reply_logs_created_idx on review_reply_logs(created_at);

alter table review_reply_logs enable row level security;
-- 읽기: 본사 전체 / 원장·멤버는 우리 지점 (코칭 카드 집계용)
drop policy if exists review_reply_logs_read on review_reply_logs;
create policy review_reply_logs_read on review_reply_logs for select
  using (is_hq() or branch_id = my_branch_id());
-- 쓰기: 본인이 사용한 것만 기록
drop policy if exists review_reply_logs_insert on review_reply_logs;
create policy review_reply_logs_insert on review_reply_logs for insert
  with check (author_id = auth.uid() and (branch_id = my_branch_id() or is_hq()));
