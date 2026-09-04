-- =====================================================================
-- 성과 대시보드 (HandSOS 크롤러 이식) + 아카데미 마케팅 대시보드(아임웹)
-- 실행: Supabase SQL Editor 에 붙여넣기
-- =====================================================================

-- ── 지점 ↔ HandSOS 매핑 ──
alter table branches add column if not exists handsos_pk text;     -- PkCompany
alter table branches add column if not exists handsos_label text;  -- 크롤러 표시명

-- 누락 지점 추가 (이름 unique → 충돌 시 무시)
insert into branches (name, region, knowledge_slug) values
  ('사가정2호점', '서울 중랑구', '사가정2호점'),
  ('서초방배점', '서울 서초구', '서초방배점'),
  ('부천신중동점', '경기 부천시', '부천신중동점')
on conflict (name) do nothing;

-- HandSOS PkCompany 매핑 (크롤러 데이터 있는 5곳)
update branches set handsos_pk = '12549306', handsos_label = '성수점'      where name = '성수점';
update branches set handsos_pk = '12549311', handsos_label = '마곡나루점'   where name = '마곡나루점';
update branches set handsos_pk = '12554562', handsos_label = '강남신사점'   where name = '강남신사점';
update branches set handsos_pk = '12549314', handsos_label = '사가정 1호점' where name = '사가정점';
update branches set handsos_pk = '12549305', handsos_label = '사가정 2호점' where name = '사가정2호점';
-- 서면전포점/서초방배점/부천신중동점 = handsos_pk null (데이터 없음 → 대시보드 빈 상태)

-- ── 일별 지점/디자이너 성과 (HandSOS) ──
create table if not exists metrics_daily (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  date date not null,
  scope text not null default 'branch' check (scope in ('branch','designer')),
  designer_name text not null default '',   -- scope=branch 이면 ''
  cut int not null default 0,
  perm int not null default 0,
  recovery int not null default 0,          -- 복구매직
  clinic int not null default 0,
  dye int not null default 0,               -- 염색
  etc int not null default 0,               -- 기타시술
  new_sales bigint not null default 0,      -- 신규매출
  repeat_sales bigint not null default 0,   -- 재방매출
  guest_count int not null default 0,       -- 접객수
  avg_price int not null default 0,         -- 객단가
  created_at timestamptz not null default now(),
  unique (branch_id, date, scope, designer_name)
);
create index if not exists metrics_daily_branch_date on metrics_daily(branch_id, date);

alter table metrics_daily enable row level security;
drop policy if exists metrics_read on metrics_daily;
create policy metrics_read on metrics_daily for select
  using (is_hq() or branch_id = my_branch_id());
-- 쓰기는 서버(admin 클라이언트)만 → 정책 없음 (RLS 기본 거부)

-- ── 아카데미 마케팅 (아임웹) — 지점과 무관한 별도 사업 ──
create table if not exists marketing_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  channel text not null,                    -- 네이버/인스타그램/구글/페이스북/카카오/유튜브
  total_visits int not null default 0,      -- 전체방문횟수
  visitors int not null default 0,          -- 방문자수
  signups int not null default 0,           -- 회원전환수
  buyers int not null default 0,            -- 구매자수
  purchase_count int not null default 0,    -- 구매량
  purchase_amount bigint not null default 0,-- 총구매금액
  created_at timestamptz not null default now(),
  unique (date, channel)
);
create index if not exists marketing_daily_date on marketing_daily(date);

alter table marketing_daily enable row level security;
drop policy if exists marketing_read on marketing_daily;
create policy marketing_read on marketing_daily for select using (is_hq());
-- 쓰기는 서버(admin)만
