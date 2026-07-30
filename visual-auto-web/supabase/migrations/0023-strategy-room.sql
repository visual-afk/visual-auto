-- =====================================================================
-- 본사전략실 (HQ Strategy Room)
-- 사업 구조도(기본표)를 홈으로 쓰는 본사 내부 대시보드.
-- 9개 영역 · 영역당 3지표 · 실험 카드 · 회의록 · 변경 이력.
-- LIVE 지표는 여기 저장하지 않고 요청 시 기존 집계함수로 계산한다.
-- 이 SQL은 수동 지표값 / 실험 / 회의 / 문제·결정 텍스트 / 정의만 저장한다.
--
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
-- =====================================================================

-- ── 영역(노드) 9개 ──
create table if not exists strategy_areas (
  id            text primary key,                 -- 슬러그 (hq/branch/customer/...)
  name          text not null,
  type          text not null default '순환' check (type in ('순환','위성','과제')),
  subtitle      text,
  owner_name    text,                             -- 표시용 담당자 이름 (앱 역할 단일이라 텍스트로 보관)
  owner_user_id uuid references auth.users(id) on delete set null,
  money_formula text,
  current_problem text,
  cause_note      text,                           -- 원인 후보 한 줄(간이). 상세는 strategy_cause_candidates
  decide_next     text,
  sort_order    int not null default 0,
  map_geometry  jsonb,                            -- {x,y,r} override (없으면 코드 기본 레이아웃)
  updated_at    timestamptz not null default now()
);

-- ── 지표 (영역당 3개) ──
create table if not exists strategy_metrics (
  id              uuid primary key default gen_random_uuid(),
  area_id         text not null references strategy_areas(id) on delete cascade,
  key             text not null,                  -- 영역 내 고유 키
  name            text not null,
  unit            text,
  direction       text not null default '높을수록좋음'
                    check (direction in ('높을수록좋음','낮을수록좋음','편차축소')),
  target_value    numeric,
  warn_threshold  numeric,
  danger_threshold numeric,
  source          text not null default 'manual' check (source in ('live','manual')),
  live_key        text,                           -- source='live'일 때 집계 매핑키
  seed_value      numeric,                        -- 수동 지표 초기 예시값
  seed_context    text,
  is_unknown      boolean not null default false, -- '?' (숫자 미확보) 시작 여부
  archived        boolean not null default false,
  sort_order      int not null default 0,
  unique(area_id, key)
);

-- ── 지표 값 (주 단위, 수동 입력) ──
create table if not exists strategy_metric_values (
  id           uuid primary key default gen_random_uuid(),
  metric_id    uuid not null references strategy_metrics(id) on delete cascade,
  value        numeric,
  context_note text,
  week_of      date not null,
  entered_by   uuid references auth.users(id) on delete set null,
  entered_at   timestamptz not null default now(),
  unique(metric_id, week_of)
);

-- ── 원인 후보 ──
create table if not exists strategy_cause_candidates (
  id          uuid primary key default gen_random_uuid(),
  area_id     text not null references strategy_areas(id) on delete cascade,
  text        text not null,
  proposed_by uuid references auth.users(id) on delete set null,
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 실험 카드 ──
create table if not exists strategy_experiments (
  id            uuid primary key default gen_random_uuid(),
  area_id       text not null references strategy_areas(id) on delete cascade,
  phenomenon    text,                             -- 현상(문제 숫자)
  hypothesis    text,                             -- 원인 가설
  prediction    text,                             -- 예측
  action        text,                             -- 실행 내용
  assignee_name text,                             -- 담당 (표시용)
  assignee_id   uuid references auth.users(id) on delete set null,
  due_date      date,
  check_metric_id uuid references strategy_metrics(id) on delete set null,
  status        text not null default '설계중'
                  check (status in ('설계중','진행중','결과대기','완료')),
  result_value  text,                             -- 결과 숫자(+텍스트)
  result_note   text,
  learned       text,                             -- 배운 것
  promotion     text check (promotion in ('승격','보류','기각')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists strategy_experiments_area_idx on strategy_experiments(area_id);
create index if not exists strategy_experiments_status_idx on strategy_experiments(status);

-- ── 회의록 ──
create table if not exists strategy_meetings (
  id            uuid primary key default gen_random_uuid(),
  meeting_date  date not null,
  attendees     jsonb not null default '[]'::jsonb,
  minutes       jsonb not null default '{}'::jsonb,   -- 단계별 기록
  created_experiment_ids jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── 변경 이력 ──
create table if not exists strategy_edit_history (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   text not null,
  field       text,
  old_value   text,
  new_value   text,
  edited_by   uuid references auth.users(id) on delete set null,
  edited_at   timestamptz not null default now()
);
create index if not exists strategy_edit_history_entity_idx
  on strategy_edit_history(entity_type, entity_id);

-- ── RLS: 본사만 접근 (서버는 service-role로 우회) ──
-- is_hq() 등 헬퍼에 의존하지 않고 branch_users를 직접 확인 (환경마다 헬퍼 유무가 달라서).
alter table strategy_areas            enable row level security;
alter table strategy_metrics          enable row level security;
alter table strategy_metric_values    enable row level security;
alter table strategy_cause_candidates enable row level security;
alter table strategy_experiments      enable row level security;
alter table strategy_meetings         enable row level security;
alter table strategy_edit_history     enable row level security;

-- branch_users가 있으면 hq_admin만 허용, 없으면 false(=service-role 서버만 접근).
-- 앱 서버는 service-role로 RLS를 우회하므로 어느 쪽이든 정상 동작한다.
do $$
declare
  t text;
  cond text;
begin
  if to_regclass('public.branch_users') is not null then
    cond := 'exists (select 1 from public.branch_users bu where bu.user_id = auth.uid() and bu.role = ''hq_admin'')';
  else
    cond := 'false';
  end if;
  foreach t in array array[
    'strategy_areas','strategy_metrics','strategy_metric_values',
    'strategy_cause_candidates','strategy_experiments','strategy_meetings','strategy_edit_history'
  ]
  loop
    execute format('drop policy if exists hq_all on %I', t);
    execute format('create policy hq_all on %I for all using (%s) with check (%s)', t, cond, cond);
  end loop;
end $$;

-- =====================================================================
-- 시드: 9영역 + 27지표 (부록 A). 값 없는 지표는 is_unknown=true("?")로 시작.
-- =====================================================================
insert into strategy_areas (id, name, type, subtitle, owner_name, money_formula, sort_order) values
  ('hq',        '본사',        '순환', '기준의 엔진',      '하나 실장',   '기준 준수율 → 균일함 → 4개 사업부 전체 매출', 1),
  ('branch',    '지점',        '순환', '1차 고객',         '박은애 주임', '신규 × 객단가 × 재방 × 8지점',               2),
  ('customer',  '고객',        '순환', '살롱 B2C 퍼널',    '김예진 매니저','노출 × 유입률 × 예약 전환율',                3),
  ('reputation','브랜드 평판', '순환', '직접 전환 아님',   '김예진 매니저','리뷰 수 × 평점 × 콘텐츠 노출 → 아카데미 모객 비용 절감', 4),
  ('academy',   '아카데미',    '순환', '공급자 전환',      '셀린 본부장', '설명회 신청 × 수강 전환율 × 수강료 (+미래 직원)', 5),
  ('staff',     '좋은 직원',   '순환', null,               '셀린 본부장', '직원 1명 = 지점 확장·균일함의 원료',         6),
  ('trifield',  '타지점',      '위성', '트리필드 B2B',     '이성연 본부장','거래처 × 월 발주액 × 재주문율',              7),
  ('nuhye',     '누혜',        '위성', '일반 고객',        '이성연 본부장','유입 × 구매 전환율 × 객단가',                8),
  ('anxiety',   '불안·System化','과제','System으로 해결 가능한지 파악 필요','하나 실장','불안 1건 해소 = 지점 전환 확률 상승 = 가맹 매출', 9)
on conflict (id) do nothing;

-- 지표 27개
insert into strategy_metrics (area_id, key, name, unit, direction, source, live_key, seed_value, seed_context, is_unknown, sort_order) values
  -- 본사
  ('hq','std_sentences','기준 문장 수','/30','높을수록좋음','manual',null,0,'VG 코드 문서 승격 누적',false,1),
  ('hq','manual_dist','매뉴얼 배포율','%','높을수록좋음','manual',null,null,null,true,2),
  ('hq','feedback_rate','Feedback 처리율','%','높을수록좋음','manual',null,null,null,true,3),
  -- 지점
  ('branch','revisit_dev','재방률 편차','%p','편차축소','live','branch_revisit_dev',null,null,false,1),
  ('branch','checklist','체크리스트 준수율','%','높을수록좋음','live','branch_checklist',null,null,false,2),
  ('branch','review_dev','리뷰 평점 편차','점','편차축소','manual',null,null,'별점 데이터 미수집',true,3),
  -- 고객 (퍼널)
  ('customer','exposure','노출','회','높을수록좋음','live','customer_exposure',null,null,false,1),
  ('customer','inflow','유입','회','높을수록좋음','manual',null,null,'스마트플레이스 유입 수동',true,2),
  ('customer','booking','예약 전환','명','높을수록좋음','live','customer_booking',null,null,false,3),
  -- 브랜드 평판
  ('reputation','new_reviews','월 신규 리뷰','건','높을수록좋음','manual',null,null,null,true,1),
  ('reputation','avg_rating','평균 평점','점','높을수록좋음','manual',null,null,'별점 데이터 미수집',true,2),
  ('reputation','salon_via','살롱 경유 신청 비율','%','높을수록좋음','manual',null,null,null,true,3),
  -- 아카데미
  ('academy','briefing','설명회 신청','건','높을수록좋음','live','academy_briefing',null,null,false,1),
  ('academy','enroll_rate','수강 전환율','%','높을수록좋음','live','academy_enroll_rate',null,null,false,2),
  ('academy','graduates','수료·배출','명','높을수록좋음','manual',null,null,null,true,3),
  -- 좋은 직원
  ('staff','produced','배출 인원','명','높을수록좋음','manual',null,null,null,true,1),
  ('staff','join_rate','합류율','%','높을수록좋음','manual',null,null,null,true,2),
  ('staff','retention6','6개월 유지율','%','높을수록좋음','manual',null,null,null,true,3),
  -- 타지점(트리필드)
  ('trifield','clients','거래처 수','곳','높을수록좋음','manual',null,null,null,true,1),
  ('trifield','reorder','재주문율','%','높을수록좋음','manual',null,null,null,true,2),
  ('trifield','consults','전환 상담 수','건','높을수록좋음','manual',null,null,null,true,3),
  -- 누혜
  ('nuhye','store_inflow','스토어 유입','회','높을수록좋음','manual',null,null,null,true,1),
  ('nuhye','buy_rate','구매 전환율','%','높을수록좋음','manual',null,null,'스토어 전환 추적 미설정',true,2),
  ('nuhye','sales_count','판매 건수','건','높을수록좋음','live','nuhye_orders',null,null,false,3),
  -- 불안
  ('anxiety','cases','불안 사례 수집','건','높을수록좋음','live','anxiety_cases',null,null,false,1),
  ('anxiety','categorized','유형 분류 수','개','높을수록좋음','manual',null,null,null,true,2),
  ('anxiety','promoted','매뉴얼 승격 건수','건','높을수록좋음','live','anxiety_promoted',null,null,false,3)
on conflict (area_id, key) do nothing;
