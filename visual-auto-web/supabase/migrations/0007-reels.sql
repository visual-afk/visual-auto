-- =====================================================================
-- 릴스 AI: 콘텐츠 프로필(매장톤/고객/캐릭터) + 릴스 기획·추적
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

-- ── 콘텐츠 프로필 ──
-- 매장 톤·지역(19강)은 지점 단위
alter table branches add column if not exists tone text;
alter table branches add column if not exists region_target text;

-- 고객 페르소나(10강) + 캐릭터(12강)는 디자이너 개인 단위
create table if not exists designer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  persona jsonb not null default '{}'::jsonb,    -- {age, lifestyle, concern, spend}
  character jsonb not null default '{}'::jsonb,  -- {type, oneLiner, strengths[]}
  updated_at timestamptz not null default now()
);

alter table designer_profiles enable row level security;
drop policy if exists profiles_read on designer_profiles;
create policy profiles_read on designer_profiles for select
  using (is_hq() or branch_id = my_branch_id() or user_id = auth.uid());
drop policy if exists profiles_write on designer_profiles;
create policy profiles_write on designer_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 릴스 (posts 와 동형, /track 패턴 재사용) ──
create table if not exists reels (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  reference_analysis jsonb,                 -- AI 영상 구조 분석 결과
  treatment_chips text[] default '{}',
  notes text,
  angle text,                               -- '담백'|'욕망' (14강)
  structure jsonb default '[]'::jsonb,      -- [{cut, time, shot, caption}]
  title text,
  status text not null default 'draft' check (status in ('draft','published')),
  published_url text,
  views int,
  views_updated_at timestamptz,
  next_check_at date,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists reels_branch_idx on reels(branch_id);
create index if not exists reels_author_idx on reels(author_id);

alter table reels enable row level security;
drop policy if exists reels_read on reels;
create policy reels_read on reels for select using (is_hq() or branch_id = my_branch_id());
drop policy if exists reels_insert on reels;
create policy reels_insert on reels for insert
  with check (author_id = auth.uid() and (branch_id = my_branch_id() or is_hq()));
drop policy if exists reels_update on reels;
create policy reels_update on reels for update
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));
drop policy if exists reels_delete on reels;
create policy reels_delete on reels for delete
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));
