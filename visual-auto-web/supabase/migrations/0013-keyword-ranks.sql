-- =====================================================================
-- 키워드 상위노출 체크: 네이버 검색 API 순위 + 구글 서치콘솔 스냅샷
-- 네이버는 블로그 검색 API(블로그탭) 기준 1~100위, GSC는 쿼리별 노출/클릭/평균순위.
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

create table if not exists keyword_ranks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  period text not null,                  -- keyword_sets.period ('YYYY-MM')
  keyword text not null,
  source text not null check (source in ('naver_blog','naver_web','gsc')),
  rank int,                              -- null = 100위 밖(네이버) / 노출 없음(GSC)
  matched_url text,                      -- 순위에 잡힌 우리 글 URL
  post_id uuid references posts(id) on delete set null,
  total_results bigint,                  -- 네이버 검색결과 총 개수 (경쟁 규모 참고)
  impressions int,                       -- gsc 전용: 노출수
  clicks int,                            -- gsc 전용: 클릭수
  check_date date not null,              -- KST 기준 체크일 (하루 1스냅샷)
  checked_at timestamptz not null default now(),
  unique (branch_id, period, keyword, source, check_date)
);
create index if not exists keyword_ranks_branch_idx
  on keyword_ranks(branch_id, period, check_date desc);

alter table keyword_ranks enable row level security;
-- 읽기: 본사 전체 / 그 외는 우리 지점
drop policy if exists keyword_ranks_read on keyword_ranks;
create policy keyword_ranks_read on keyword_ranks for select
  using (is_hq() or branch_id = my_branch_id());
-- 쓰기 정책 없음: 수집은 서버(service role)만.
