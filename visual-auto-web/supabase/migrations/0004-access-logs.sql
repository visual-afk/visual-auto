-- =====================================================================
-- 접근 로그 — 고객/멤버 정보 화면 조회 이력 (유출 사후 추적용)
-- 실행: Supabase 대시보드 SQL Editor 에 붙여넣기 (1회)
-- insert 는 서버(service_role)에서만, 조회는 본사(hq_admin)만.
-- =====================================================================

create table if not exists access_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  member_id    uuid,
  display_name text,
  branch_id    uuid,
  path         text not null,        -- 조회한 경로 (예: /members, /track/<id>)
  action       text not null,        -- 무엇을 봤나 (예: view_members, view_post)
  created_at   timestamptz not null default now()
);

create index if not exists access_logs_created_idx on access_logs(created_at desc);
create index if not exists access_logs_user_idx on access_logs(user_id);

alter table access_logs enable row level security;

-- 조회는 본사만. insert/update/delete 는 정책 없음 → service_role(서버)만 가능.
drop policy if exists access_logs_read on access_logs;
create policy access_logs_read on access_logs for select using (is_hq());
