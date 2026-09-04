-- =====================================================================
-- 멤버 관리 마이그레이션 — '인턴' 역할 추가
-- 실행: Supabase 대시보드 SQL Editor 에 붙여넣기 (운영 테이블에 ALTER)
-- 인턴 = 디자이너와 권한 100% 동일. role 값(=라벨)만 추가한다.
-- =====================================================================

-- branch_users.role 에 'intern' 허용
alter table branch_users drop constraint if exists branch_users_role_check;
alter table branch_users
  add constraint branch_users_role_check
  check (role in ('hq_admin','branch_owner','designer','intern'));

-- invites.role 에 'intern' 허용 (본사는 원장도 초대 가능 → branch_owner 유지)
alter table invites drop constraint if exists invites_role_check;
alter table invites
  add constraint invites_role_check
  check (role in ('branch_owner','designer','intern'));

-- is_active 조회 인덱스 (멤버 목록 정렬/필터용)
create index if not exists branch_users_active_idx on branch_users(is_active);

-- members_write / invites_rw 는 변경 없음:
--   이미 (hq) 또는 (branch_owner & 같은 지점) 으로 쓰기를 허용.
--   역할별 대상 제한·자기자신 보호·완전삭제는 API 레이어에서 enforce 한다.

-- 본사(hq_admin)도 글쓰기 가능하게 — posts insert 에 is_hq() 허용 (지점은 글쓰기 시 선택)
drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert
  with check (author_id = auth.uid() and (branch_id = my_branch_id() or is_hq()));
