// 클라이언트·서버 공용 역할 상수 (서버 전용 import 없음 — 클라 컴포넌트에서도 안전)

export type Role = 'hq_admin' | 'branch_owner' | 'designer' | 'intern';

/** 멤버를 초대·관리(역할변경/퇴출)할 수 있는 권한 — 본사·원장만. (인턴/디자이너는 불가) */
export const canManage = (role: Role): boolean => role === 'hq_admin' || role === 'branch_owner';

/** 화면 라벨 (역할 뱃지) */
export const roleLabel: Record<Role, string> = {
  hq_admin: '본사',
  branch_owner: '원장',
  designer: '디자이너',
  intern: '인턴',
};
