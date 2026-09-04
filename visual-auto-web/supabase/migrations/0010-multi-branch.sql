-- =====================================================================
-- 한 사람 = 여러 지점 (멀티 지점 소속) 지원
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
--
-- 설계: branch_users(신원·전화·역할, 사용자당 1행)는 그대로 두고,
--       member_branches(user_id, branch_id) 조인 테이블로 "활동 가능한 지점 집합"을 관리.
--       branch_users.branch_id = 홈/기본 지점. member_branches = 홈 포함 전체 활동 지점.
-- =====================================================================

-- ── 1. 조인 테이블 ──────────────────────────────────────────────────
create table if not exists member_branches (
  user_id   uuid not null references auth.users(id) on delete cascade,
  branch_id uuid not null references branches(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);
create index if not exists member_branches_branch_idx on member_branches(branch_id);

-- ── 2. 기존 사용자 백필 (홈 지점 → member_branches) ─────────────────
-- 모든 기존 단일지점 사용자는 자기 지점 1개 그대로. 동작 변화 없음.
insert into member_branches (user_id, branch_id)
select user_id, branch_id from branch_users where branch_id is not null
on conflict do nothing;

-- ── 3. RLS 헬퍼: 내가 활동 가능한 모든 지점 ──────────────────────────
create or replace function my_branch_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from member_branches where user_id = auth.uid()
  union
  select branch_id from branch_users where user_id = auth.uid() and branch_id is not null;
$$;
-- my_branch_id()/my_role()/is_hq() 는 홈·역할 판정에 계속 사용 (변경 없음).

-- ── 4. RLS 정책 재작성: branch_id = my_branch_id() → in (select my_branch_ids()) ──

-- branches
drop policy if exists branches_read on branches;
create policy branches_read on branches for select
  using (is_hq() or id in (select my_branch_ids()));

-- branch_users
drop policy if exists members_read on branch_users;
create policy members_read on branch_users for select
  using (is_hq() or branch_id in (select my_branch_ids()) or user_id = auth.uid());
drop policy if exists members_write on branch_users;
create policy members_write on branch_users for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- member_branches 자체 RLS (본사·원장이 자기 지점집합 내 배정 관리)
alter table member_branches enable row level security;
drop policy if exists member_branches_read on member_branches;
create policy member_branches_read on member_branches for select
  using (is_hq() or branch_id in (select my_branch_ids()) or user_id = auth.uid());
drop policy if exists member_branches_write on member_branches;
create policy member_branches_write on member_branches for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- invites
drop policy if exists invites_rw on invites;
create policy invites_rw on invites for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- posts
drop policy if exists posts_read on posts;
create policy posts_read on posts for select using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert
  with check (author_id = auth.uid() and (branch_id in (select my_branch_ids()) or is_hq()));
drop policy if exists posts_update on posts;
create policy posts_update on posts for update
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));
drop policy if exists posts_delete on posts;
create policy posts_delete on posts for delete
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- keyword_sets (0003)
drop policy if exists keyword_sets_read on keyword_sets;
create policy keyword_sets_read on keyword_sets for select
  using (is_hq() or branch_id in (select my_branch_ids()));

-- attendance_events (0005)
drop policy if exists attendance_read on attendance_events;
create policy attendance_read on attendance_events for select
  using (is_hq() or branch_id in (select my_branch_ids()) or user_id = auth.uid());

-- metrics_daily (0006)
drop policy if exists metrics_read on metrics_daily;
create policy metrics_read on metrics_daily for select
  using (is_hq() or branch_id in (select my_branch_ids()));

-- designer_profiles (0007)
drop policy if exists profiles_read on designer_profiles;
create policy profiles_read on designer_profiles for select
  using (is_hq() or branch_id in (select my_branch_ids()) or user_id = auth.uid());

-- reels (0007)
drop policy if exists reels_read on reels;
create policy reels_read on reels for select using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists reels_insert on reels;
create policy reels_insert on reels for insert
  with check (author_id = auth.uid() and (branch_id in (select my_branch_ids()) or is_hq()));
drop policy if exists reels_update on reels;
create policy reels_update on reels for update
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));
drop policy if exists reels_delete on reels;
create policy reels_delete on reels for delete
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- review_reply_logs (0008-coaching)
drop policy if exists review_reply_logs_read on review_reply_logs;
create policy review_reply_logs_read on review_reply_logs for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists review_reply_logs_insert on review_reply_logs;
create policy review_reply_logs_insert on review_reply_logs for insert
  with check (author_id = auth.uid() and (branch_id in (select my_branch_ids()) or is_hq()));

-- ── 5. 방지성 원장 → 마곡나루점 추가 (이름 기준, 재실행 안전) ─────────
insert into member_branches (user_id, branch_id)
select bu.user_id, b.id
from branch_users bu
cross join branches b
where bu.display_name = '방지성'
  and bu.branch_id = (select id from branches where name = '강남신사점')
  and b.name = '마곡나루점'
on conflict do nothing;
