-- =====================================================================
-- 플레이스 통계 스냅샷: 스마트플레이스 통계 스크린샷 OCR 결과 저장
-- (네이버는 통계 API가 없어 화면 캡처 → AI 추출로 수집한다)
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

create table if not exists place_stats (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  stat_date date not null,                 -- 통계 기준일 (일/주/월의 시작일)
  period text not null default 'week' check (period in ('day','week','month')),
  place_views int,                         -- 플레이스 조회(방문) 수
  inflows jsonb default '[]'::jsonb,       -- 유입 채널/키워드 [{name, count}]
  review_count int,                        -- 리뷰 수 스냅샷 (추이용)
  source text not null default 'ocr',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_id, period, stat_date)
);
create index if not exists place_stats_branch_idx on place_stats(branch_id, stat_date desc);

alter table place_stats enable row level security;
-- 읽기: 본사 전체 / 그 외는 우리 지점 (성과 대시보드 집계용)
drop policy if exists place_stats_read on place_stats;
create policy place_stats_read on place_stats for select
  using (is_hq() or branch_id = my_branch_id());
-- 쓰기: 본사 / 우리 지점 원장만
drop policy if exists place_stats_write on place_stats;
create policy place_stats_write on place_stats for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id = my_branch_id()));
