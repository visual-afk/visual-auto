import { getAdminSupabase } from './supabase/admin';
import type { MemberContext } from './auth';

/**
 * 고객/멤버 정보 화면 조회 이력을 남긴다 (유출 사후 추적용).
 * best-effort — 기록 실패가 페이지 렌더를 막지 않는다.
 */
export async function logAccess(member: MemberContext, path: string, action: string): Promise<void> {
  try {
    await getAdminSupabase().from('access_logs').insert({
      user_id: member.userId,
      member_id: member.memberId,
      display_name: member.displayName,
      branch_id: member.branchId,
      path,
      action,
    });
  } catch {
    // 로깅 실패는 무시 (페이지는 정상 렌더)
  }
}
