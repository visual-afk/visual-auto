-- =====================================================================
-- 콘텐츠 오버라이드: 프롬프트·지식베이스를 웹에서 편집 (본사 전용)
-- 파일(prompts/·knowledge/)은 기본값으로 두고, 이 테이블이 있으면 덮어쓴다.
-- 우선순위: 지점 오버라이드 → 전사 공통 오버라이드 → 파일 기본값
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

create table if not exists content_overrides (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('prompt','knowledge')),
  slug text not null,                    -- 프롬프트명('blog-writer') 또는 knowledge 상대경로('brand/brand-voice.md')
  branch_id uuid references branches(id) on delete cascade,  -- null = 전사 공통
  content text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 전사 공통은 (kind,slug) 유일, 지점별은 (kind,slug,branch_id) 유일
create unique index if not exists content_overrides_global
  on content_overrides(kind, slug) where branch_id is null;
create unique index if not exists content_overrides_branch
  on content_overrides(kind, slug, branch_id) where branch_id is not null;

alter table content_overrides enable row level security;

-- 읽기·쓰기 모두 본사만. (생성 파이프라인 소비는 서버 admin 클라이언트로 RLS 우회)
drop policy if exists content_overrides_rw on content_overrides;
create policy content_overrides_rw on content_overrides for all
  using (is_hq()) with check (is_hq());
