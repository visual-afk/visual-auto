-- =====================================================================
-- 비주얼살롱 디자이너 셀프서비스 웹앱 — Supabase 스키마
-- 실행: Supabase 대시보드 SQL Editor 에 붙여넣기 (또는 supabase db push)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 지점 (발행 계정 보유 단위 = 멀티테넌트 키)
-- ---------------------------------------------------------------------
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,            -- 성수점/마곡나루점/강남신사점/사가정점/서면전포점
  region text,                          -- '서울 성동구' / '부산 부산진구'
  knowledge_slug text,                  -- knowledge/consumer/branch-{slug}.md 매칭용 ('성수점')
  naver_blog_url text,                  -- 발행 시 '네이버 열기' 대상
  imweb_url text,                       -- 발행 시 '아임웹 열기' 대상
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 멤버 (디자이너/원장/본사). 권한 3종
-- ---------------------------------------------------------------------
create table if not exists branch_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade, -- hq_admin은 null 가능
  display_name text not null,
  phone text unique,                    -- 휴대폰 번호 (동명이인 구분 + login_id 기본값)
  login_id text unique,                 -- 로그인 아이디 (synthetic email로 매핑)
  role text not null default 'designer' check (role in ('hq_admin','branch_owner','designer','intern')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------
-- 초대 (공개가입 차단). 토큰에 지점·역할이 박혀 있음
-- ---------------------------------------------------------------------
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  branch_id uuid not null references branches(id) on delete cascade,
  role text not null default 'designer' check (role in ('branch_owner','designer','intern')),
  invitee_name text,
  invitee_contact text,                 -- 카톡/문자 보낼 번호 (표시용)
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'sent' check (status in ('sent','accepted','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_branch_idx on invites(branch_id);

-- ---------------------------------------------------------------------
-- 글 + 발행/성과
-- ---------------------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  treatment_chips text[] default '{}',
  user_notes text,
  recommended_topic text,
  status text not null default 'draft' check (status in ('draft','published')),
  title text,
  meta_description text,
  tags text[] default '{}',
  content text,
  photo_guide jsonb default '[]'::jsonb,   -- [{position,label,종류,구도,포인트,alt}]
  photos jsonb default '[]'::jsonb,         -- [{slot,storage_path}]
  seo_score int,
  publish_target text check (publish_target in ('naver','imweb')),
  published_url text,
  views int,
  views_updated_at timestamptz,
  next_check_at date,                       -- "3일 뒤 다시" 리마인드
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists posts_branch_idx on posts(branch_id);
create index if not exists posts_author_idx on posts(author_id);

-- =====================================================================
-- 권한 헬퍼 (SECURITY DEFINER → RLS 재귀 회피)
-- =====================================================================
create or replace function my_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from branch_users where user_id = auth.uid() limit 1;
$$;

create or replace function my_branch_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from branch_users where user_id = auth.uid() limit 1;
$$;

create or replace function is_hq() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'hq_admin' from branch_users where user_id = auth.uid() limit 1), false);
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table branches enable row level security;
alter table branch_users enable row level security;
alter table invites enable row level security;
alter table posts enable row level security;

-- branches: 본사는 전체, 그 외엔 자기 지점만
drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (is_hq() or id = my_branch_id());

-- branch_users: 본사 전체 / 같은 지점 읽기 / 원장·본사만 쓰기
drop policy if exists members_read on branch_users;
create policy members_read on branch_users for select
  using (is_hq() or branch_id = my_branch_id() or user_id = auth.uid());
drop policy if exists members_write on branch_users;
create policy members_write on branch_users for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));

-- invites: 본사 전체 / 원장은 자기 지점
drop policy if exists invites_rw on invites;
create policy invites_rw on invites for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));

-- posts: 본사 전체 / 같은 지점 읽기 / 본인 글 쓰기
drop policy if exists posts_read on posts;
create policy posts_read on posts for select using (is_hq() or branch_id = my_branch_id());
drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert
  with check (author_id = auth.uid() and (branch_id = my_branch_id() or is_hq()));
drop policy if exists posts_update on posts;
create policy posts_update on posts for update
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));
drop policy if exists posts_delete on posts;
create policy posts_delete on posts for delete
  using (author_id = auth.uid() or is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));

-- =====================================================================
-- Storage: 디자이너 첨부 사진
-- =====================================================================
insert into storage.buckets (id, name, public)
  values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

drop policy if exists post_photos_read on storage.objects;
create policy post_photos_read on storage.objects for select
  using (bucket_id = 'post-photos');
drop policy if exists post_photos_write on storage.objects;
create policy post_photos_write on storage.objects for insert
  with check (bucket_id = 'post-photos' and auth.uid() is not null);
