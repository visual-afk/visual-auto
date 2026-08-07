-- 제품 브랜드(누혜·트리필드·아카데미) 매출 연동.
-- 구글시트(제품 마스터 + 아임웹/스마트스토어/개별구매 주문데이터)를 야간 cron이 집계해 채운다.
-- 원본 주문행은 PII(전화/주소)가 있어 저장하지 않고, 일별 집계만 보관한다.

-- 제품 카탈로그 (제품 마스터 탭 미러, sync 때마다 full refresh)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade, -- kind='brand'
  name text not null,
  code text not null default '',
  keywords text not null default '',
  event_channel text not null default '',
  event_qty int,
  event_bonus_qty int,
  event_price bigint,
  consumer_price bigint,   -- 소비자가 (개인)
  wholesale_price bigint,  -- 도매가 (타지점)
  salon_price bigint,      -- 비주얼살롱가
  ship_from text not null default '',
  sort_order int not null default 0,
  synced_at timestamptz not null default now(),
  unique (branch_id, name)
);

-- 일별 브랜드 매출 집계.
-- scope='channel' 행 = (브랜드,일,채널) 총계 — KPI/추이용, orders는 주문단위 dedup된 수.
-- scope='product' 행 = 제품별 분해 — top-N용. 채널행 revenue = Σ 그 채널 제품행 revenue.
create table if not exists product_sales_daily (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  date date not null,
  channel text not null check (channel in ('아임웹', '스마트스토어', '개별구매')),
  scope text not null default 'channel' check (scope in ('channel', 'product')),
  product_name text not null default '', -- scope='channel'이면 ''
  product_code text not null default '',
  qty int not null default 0,
  orders int not null default 0,
  revenue bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (branch_id, date, channel, scope, product_name)
);
create index if not exists product_sales_daily_branch_date on product_sales_daily (branch_id, date);

-- RLS: 읽기 = 본사 or 자기 지점(브랜드), 쓰기 = service role만(정책 없음)
alter table products enable row level security;
drop policy if exists products_read on products;
create policy products_read on products for select
  using (is_hq() or branch_id in (select my_branch_ids()));

alter table product_sales_daily enable row level security;
drop policy if exists product_sales_read on product_sales_daily;
create policy product_sales_read on product_sales_daily for select
  using (is_hq() or branch_id in (select my_branch_ids()));
