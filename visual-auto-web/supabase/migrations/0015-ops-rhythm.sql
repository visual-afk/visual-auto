-- =====================================================================
-- 원장 운영 리듬 (관리자시트 디지털화 Phase 1)
-- 업무일지 · 매일 오픈 체크 · 개인면담(녹음→AI) · 컨디션 이력 · 미팅 일지
-- 실행: Supabase 대시보드 SQL Editor 에 통째로 붙여넣기 (idempotent)
--
-- 설계:
--  - 본사는 "내용"이 아니라 "리듬"(작성률·주기)을 본다. 기록 자체는 원장 것.
--  - interviews/member_conditions 는 원장+본사만 read (디자이너가 동료 면담기록 열람 불가).
--  - 면담 녹음은 비공개 버킷(interview-audio), 접근은 전부 서버 admin + 서명 URL.
-- =====================================================================

-- ── 1. 업무일지 (원장 데일리, 지점당 하루 1행) ─────────────────────────
create table if not exists director_journals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  journal_date date not null,
  am_text text,
  pm_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, journal_date)
);
create index if not exists director_journals_branch_date_idx
  on director_journals(branch_id, journal_date desc);

alter table director_journals enable row level security;
drop policy if exists director_journals_read on director_journals;
create policy director_journals_read on director_journals for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists director_journals_write on director_journals;
create policy director_journals_write on director_journals for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- ── 2. 매일 오픈 체크 (본사 마스터 템플릿 + 지점별 일일 체크) ───────────
-- 시트 캘린더의 '라운딩 상태·cs교육&샴푸 점검' 역할을 데일리 체크로 전환.
create table if not exists daily_check_templates (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table daily_check_templates enable row level security;
drop policy if exists daily_check_templates_read on daily_check_templates;
create policy daily_check_templates_read on daily_check_templates for select
  using (true);
drop policy if exists daily_check_templates_write on daily_check_templates;
create policy daily_check_templates_write on daily_check_templates for all
  using (is_hq()) with check (is_hq());

-- 기본 항목 시딩 (이미 있으면 건너뜀 — item 텍스트 기준)
insert into daily_check_templates (item, sort)
select v.item, v.sort from (values
  ('매장 라운딩 (시설·청결 상태)', 1),
  ('샴푸대·샴푸 재고 점검', 2),
  ('시술 준비 상태 (약제·타올·기구)', 3),
  ('음료·간식·대기공간 채움', 4),
  ('근무자 상태 확인 (복장·컨디션)', 5)
) as v(item, sort)
where not exists (select 1 from daily_check_templates t where t.item = v.item);

create table if not exists daily_open_checks (
  branch_id uuid not null references branches(id) on delete cascade,
  check_date date not null,
  template_id uuid not null references daily_check_templates(id) on delete cascade,
  checked boolean not null default false,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  primary key (branch_id, check_date, template_id)
);
create index if not exists daily_open_checks_branch_date_idx
  on daily_open_checks(branch_id, check_date desc);

alter table daily_open_checks enable row level security;
drop policy if exists daily_open_checks_read on daily_open_checks;
create policy daily_open_checks_read on daily_open_checks for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists daily_open_checks_write on daily_open_checks;
create policy daily_open_checks_write on daily_open_checks for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- ── 3. 개인면담 (녹음 → AI 전사·요약, 원장 확정) ───────────────────────
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  interviewer_id uuid not null references auth.users(id) on delete cascade,
  subject_member_id uuid not null references branch_users(id) on delete cascade,
  interviewed_at date not null default current_date,
  method text not null default 'audio' check (method in ('audio', 'manual')),
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'confirmed', 'failed')),
  audio_path text,                 -- interview-audio 버킷 키
  audio_deleted_at timestamptz,    -- 보존정책(90일)으로 삭제된 시각
  transcript text,
  summary text,
  goal_professional text,          -- 직업적 목표
  goal_personal text,              -- 개인적 목표
  leader_feedback text,            -- 면담후기 & 리더 피드백
  risk_flags jsonb,                -- AI가 감지한 이탈신호 키워드 배열
  suggested_scores jsonb,          -- AI 제안 점수 {mental,physical,leader_support,popularity}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_subject_idx
  on interviews(subject_member_id, interviewed_at desc);
create index if not exists interviews_branch_idx
  on interviews(branch_id, interviewed_at desc);

alter table interviews enable row level security;
-- 원장+본사만: 디자이너가 자기/동료 면담 기록을 직접 조회할 수 없다.
drop policy if exists interviews_read on interviews;
create policy interviews_read on interviews for select
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));
drop policy if exists interviews_write on interviews;
create policy interviews_write on interviews for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- ── 4. 컨디션 이력 (면담 확정 시 1행 append — 시트의 0~10 점수 대체) ────
create table if not exists member_conditions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references branch_users(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  interview_id uuid references interviews(id) on delete set null,
  recorded_at date not null default current_date,
  mental int check (mental between 0 and 10),
  physical int check (physical between 0 and 10),
  leader_support int check (leader_support between 0 and 10),
  popularity int check (popularity between 0 and 10),
  source text not null default 'manual' check (source in ('ai', 'adjusted', 'manual')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists member_conditions_member_idx
  on member_conditions(member_id, recorded_at desc);
create index if not exists member_conditions_branch_idx
  on member_conditions(branch_id, recorded_at desc);

alter table member_conditions enable row level security;
drop policy if exists member_conditions_read on member_conditions;
create policy member_conditions_read on member_conditions for select
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));
drop policy if exists member_conditions_write on member_conditions;
create policy member_conditions_write on member_conditions for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- ── 5. 미팅 일지 (전체미팅 / 디자이너미팅) ─────────────────────────────
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  kind text not null check (kind in ('all', 'designer')),
  held_at date not null default current_date,
  facilitator_id uuid references branch_users(id) on delete set null,
  agenda text,                     -- 미팅내용 & 안건
  goals text,                      -- 목표 (지점 / 리더시각)
  review text,                     -- 미팅후기 & 리더생각
  attendee_ids uuid[] not null default '{}',
  late_ids uuid[] not null default '{}',
  absent_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_branch_idx on meetings(branch_id, held_at desc);

alter table meetings enable row level security;
drop policy if exists meetings_read on meetings;
create policy meetings_read on meetings for select
  using (is_hq() or branch_id in (select my_branch_ids()));
drop policy if exists meetings_write on meetings;
create policy meetings_write on meetings for all
  using (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())))
  with check (is_hq() or (my_role() = 'branch_owner' and branch_id in (select my_branch_ids())));

-- ── 6. 면담 녹음 버킷 (비공개 — 접근은 전부 서버 admin) ────────────────
insert into storage.buckets (id, name, public)
  values ('interview-audio', 'interview-audio', false)
  on conflict (id) do nothing;
