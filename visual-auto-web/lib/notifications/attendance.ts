import { sendAlimtalk } from './kakao';
import { getAdminSupabase } from '@/lib/supabase/admin';

// 출근 카카오 알림톡. 템플릿이 Solapi 콘솔에 등록돼 있을 때만 발송, 없으면 조용히 skip.
// → 알림 없이도 출근 기능은 완전 동작. 템플릿 등록 후 env만 꽂으면 켜진다.
const TMPL_CHECK_IN = process.env.ATTENDANCE_ALIMTALK_TEMPLATE_ID;

/**
 * 출근 시 해당 지점 점장(branch_owner)들에게 출근 알림톡 발송 (best-effort, throw 안 함).
 * 점장이 없으면 본사(hq_admin)에게 보낸다. 템플릿/키 없으면 조용히 skip.
 */
export async function sendCheckInAlimtalk(p: {
  branchId: string | null;
  branchName: string | null;
  displayName: string;
  time: string; // 'HH:mm'
}): Promise<void> {
  if (!TMPL_CHECK_IN) return;
  try {
    const admin = getAdminSupabase();
    // 같은 지점 점장 우선, 없으면 본사
    let recipients: { phone: string | null }[] = [];
    if (p.branchId) {
      const { data } = await admin
        .from('branch_users')
        .select('phone')
        .eq('branch_id', p.branchId)
        .eq('role', 'branch_owner')
        .eq('is_active', true);
      recipients = data ?? [];
    }
    if (recipients.length === 0) {
      const { data } = await admin
        .from('branch_users')
        .select('phone')
        .eq('role', 'hq_admin')
        .eq('is_active', true);
      recipients = data ?? [];
    }

    await Promise.all(
      recipients
        .map((r) => r.phone)
        .filter((phone): phone is string => Boolean(phone))
        .map((phone) =>
          sendAlimtalk({
            to: phone,
            templateId: TMPL_CHECK_IN,
            variables: {
              '#{이름}': p.displayName,
              '#{지점}': p.branchName || '비주얼살롱',
              '#{시각}': p.time,
            },
          }),
        ),
    );
  } catch {
    // 알림 실패는 출근 처리를 막지 않는다
  }
}
