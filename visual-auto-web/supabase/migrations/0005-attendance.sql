-- =====================================================================
-- GPS 출근체크 — 근태 이벤트 + 지점 지오펜스 좌표 + 출근 사진 버킷
-- 실행: Supabase 대시보드 SQL Editor 에 붙여넣기 (1회)
-- insert/update/delete 는 서버(service_role)에서만, 조회는 RLS로 본사·점장·본인.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) 지점 지오펜스 좌표 — 본사가 직접 입력. 반경 기본 200m.
-- ---------------------------------------------------------------------
alter table branches add column if not exists lat numeric(10,7);
alter table branches add column if not exists lng numeric(10,7);
alter table branches add column if not exists geofence_radius_m int not null default 200;

-- ---------------------------------------------------------------------
-- (b) 근태 이벤트 — 출근/퇴근/외출/복귀 + 출근시 그루밍 자가체크
-- ---------------------------------------------------------------------
create table if not exists attendance_events (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references branch_users(id) on delete cascade,
  user_id       uuid not null,
  branch_id     uuid references branches(id),
  display_name  text,
  event_type    text not null check (event_type in ('check_in','check_out','step_out','return')),
  -- 출근/퇴근/외출/복귀
  lat           numeric(10,7),
  lng           numeric(10,7),
  accuracy_m    numeric(7,1),
  distance_m    numeric(8,1),          -- 지점에서의 거리 (m)
  within_geofence boolean,             -- null = 지점 좌표 미설정(검증 불가)
  -- 출근(check_in) 전용 그루밍 자가체크
  groom_nametag boolean default false, -- 명찰
  groom_radio   boolean default false, -- 무전기
  groom_makeup  boolean default false, -- 메이크업
  groom_hair    boolean default false, -- 헤어
  photo_path    text,                  -- attendance-photos 버킷 경로
  created_at    timestamptz not null default now()
);
create index if not exists att_member_idx  on attendance_events(member_id, created_at desc);
create index if not exists att_branch_idx  on attendance_events(branch_id, created_at desc);
create index if not exists att_created_idx on attendance_events(created_at desc);

alter table attendance_events enable row level security;

-- 읽기: 본사 전체 / 점장 자기 지점 / 본인 본인것.
-- insert/update/delete 는 정책 없음 → service_role(서버)만 가능.
drop policy if exists attendance_read on attendance_events;
create policy attendance_read on attendance_events for select
  using (is_hq() or branch_id = my_branch_id() or user_id = auth.uid());

-- ---------------------------------------------------------------------
-- (c) 출근 사진 버킷 (비공개) — 업로드·읽기 모두 서버 admin 으로 처리.
--     staff 셀프 사진이라 비공개. 본사/점장은 서명 URL로 열람.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('attendance-photos', 'attendance-photos', false)
  on conflict (id) do nothing;
