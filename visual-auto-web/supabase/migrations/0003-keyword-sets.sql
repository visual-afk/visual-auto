-- =====================================================================
-- 키워드 조사 (예진매니저=본사가 매달 엑셀 업로드 → 추천 주제/키워드 반영)
-- 한 파일 안에 지점별 시트 1개씩. 시트명 = branches.name 으로 매칭.
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

create table if not exists keyword_sets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade, -- 시트명 매칭 실패 시 null
  branch_label text not null,           -- 원본 시트명 (미매칭 지점 추적: '사가정2호점' 등)
  period text not null,                 -- 'YYYY-MM' (파일명/입력값)
  rows jsonb not null default '[]'::jsonb, -- [{keyword,category,subcategory,volume,competition,recommend}]
  summary text,                         -- 프롬프트 주입용 컴파일 마크다운 (recommend 우선)
  source_filename text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 같은 지점(라벨)+월이면 교체되도록 upsert 키
create unique index if not exists keyword_sets_label_period
  on keyword_sets(branch_label, period);
create index if not exists keyword_sets_branch_idx on keyword_sets(branch_id);

alter table keyword_sets enable row level security;

-- 읽기: 본사 전체 / 지점은 자기 것. 쓰기: 본사만 (서버는 admin 클라이언트로 우회)
drop policy if exists keyword_sets_read on keyword_sets;
create policy keyword_sets_read on keyword_sets for select
  using (is_hq() or branch_id = my_branch_id());
drop policy if exists keyword_sets_write on keyword_sets;
create policy keyword_sets_write on keyword_sets for all
  using (is_hq()) with check (is_hq());
