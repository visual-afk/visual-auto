-- =====================================================================
-- 카드뉴스 레퍼런스 이미지 학습
--   예진매니저가 브랜드별 레퍼런스 이미지를 계속 먹이면 Gemini Vision이
--   디자인 DNA(색·레이아웃·무드) + 에디토리얼 패턴(문구 톤·훅·CTA)을 추출해
--   브랜드별 누적 스타일 프로필로 취합한다. 생성 시 이 프로필을 주입한다.
--
--   1) card-references 버킷 (private) — 원본 레퍼런스 이미지
--   2) card_reference_images — 장별 분석 원본 보존(재취합 가능)
--   3) card_style_profiles — 브랜드별 누적 대표 프로필(design + editorial)
--
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- ⚠️ 배포 순서: 이 SQL을 먼저 실행한 뒤 코드를 배포할 것
-- =====================================================================

-- ── 1) 레퍼런스 이미지 버킷 (private — 서버 service-role로만 접근) ──
insert into storage.buckets (id, name, public)
  values ('card-references', 'card-references', false)
  on conflict (id) do nothing;

drop policy if exists card_references_read on storage.objects;
create policy card_references_read on storage.objects for select
  using (bucket_id = 'card-references' and is_hq());
drop policy if exists card_references_write on storage.objects;
create policy card_references_write on storage.objects for insert
  with check (bucket_id = 'card-references' and is_hq());

-- ── 2) 장별 분석 원본 (재취합용) ──
create table if not exists card_reference_images (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  image_path text not null,                          -- card-references 버킷 경로
  dna        jsonb not null default '{}'::jsonb,     -- 디자인 DNA (layout/style/decorations/mood/description)
  editorial  jsonb not null default '{}'::jsonb,     -- 에디토리얼 (tone/hook_style/cta_style/sample_phrases)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists card_reference_images_branch_idx on card_reference_images(branch_id);

-- ── 3) 브랜드별 누적 대표 프로필 ──
create table if not exists card_style_profiles (
  branch_id   uuid primary key references branches(id) on delete cascade,
  design      jsonb not null default '{}'::jsonb,    -- 취합된 렌더 토큰 superset (bg/ink/point/bgAngle/titleSize/…)
  editorial   jsonb not null default '{}'::jsonb,    -- 취합된 에디토리얼 가이드 (tone/hooks/ctas/sample_phrases)
  image_count int not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── RLS: 본사만 (서버는 service-role로 우회). card_frames 정책 미러. ──
alter table card_reference_images enable row level security;
alter table card_style_profiles   enable row level security;

drop policy if exists card_reference_images_all on card_reference_images;
create policy card_reference_images_all on card_reference_images for all
  using (is_hq()) with check (is_hq());

-- 프로필은 누구나 읽되(생성 파이프라인/미리보기) 쓰기는 본사만.
drop policy if exists card_style_profiles_read on card_style_profiles;
create policy card_style_profiles_read on card_style_profiles for select
  using (auth.uid() is not null);
drop policy if exists card_style_profiles_write on card_style_profiles;
create policy card_style_profiles_write on card_style_profiles for all
  using (is_hq()) with check (is_hq());
