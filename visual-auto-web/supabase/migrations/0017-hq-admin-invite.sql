-- 0017: 초대(invites)에 본사 관리자(hq_admin) 역할 허용
-- 실행: Supabase 대시보드 → SQL Editor에 전체 붙여넣기 → Run
--
-- 본사 관리자 초대는 지점이 없다 (branch_users와 동일하게 hq_admin은 branch_id null).

alter table invites alter column branch_id drop not null;

alter table invites drop constraint if exists invites_role_check;
alter table invites
  add constraint invites_role_check
  check (role in ('hq_admin','branch_owner','designer','intern'));

-- 지점 초대는 여전히 지점 필수 (본사 초대만 null 허용)
alter table invites drop constraint if exists invites_branch_required_check;
alter table invites
  add constraint invites_branch_required_check
  check (role = 'hq_admin' or branch_id is not null);
