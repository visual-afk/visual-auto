import { sendAlimtalk } from './kakao';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';

// 콘텐츠 일정 기한 경과 알림톡. 템플릿이 Solapi 콘솔에 등록돼 있을 때만 발송, 없으면 조용히 skip.
// → 알림 없이도 캘린더 기능은 완전 동작. 템플릿 등록 후 env만 꽂으면 켜진다.
const TMPL_PLAN_OVERDUE = process.env.KAKAO_TMPL_PLAN_OVERDUE;

export const overdueAlimtalkConfigured = (): boolean => !!TMPL_PLAN_OVERDUE;

export interface OverdueScheduleItem {
  id: string;
  branch_id: string;
  title: string;
  scheduled_date: string; // YYYY-MM-DD
  assignee_id: string | null; // branch_users.id
}

function fmtMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function daysOverdue(scheduledDate: string, todayStr: string): number {
  return Math.max(
    1,
    Math.round((new Date(`${todayStr}T00:00:00Z`).getTime() - new Date(`${scheduledDate}T00:00:00Z`).getTime()) / 86400_000),
  );
}

/**
 * 기한 지난 계획 1건에 대해 담당자 + 해당 지점 원장(없으면 본사)에게 알림톡 발송.
 * best-effort — 절대 throw 하지 않고 발송 건수를 반환한다.
 */
export async function sendOverdueAlimtalk(item: OverdueScheduleItem, branchName: string | null): Promise<number> {
  if (!TMPL_PLAN_OVERDUE) return 0;
  try {
    const admin = getAdminSupabase();
    const today = kstTodayStr();

    // 담당자 (assignee_id = branch_users.id — 발행물 author 의 user_id 매핑과 다름)
    let assigneeName: string | null = null;
    const phones = new Set<string>();
    if (item.assignee_id) {
      const { data: a } = await admin
        .from('branch_users')
        .select('display_name, phone, is_active')
        .eq('id', item.assignee_id)
        .maybeSingle();
      if (a) {
        assigneeName = a.display_name;
        if (a.is_active && a.phone) phones.add(a.phone);
      }
    }

    // 해당 지점 원장 전원, 없으면 본사 폴백 (attendance.ts 관례)
    const { data: owners } = await admin
      .from('branch_users')
      .select('phone')
      .eq('branch_id', item.branch_id)
      .eq('role', 'branch_owner')
      .eq('is_active', true);
    let managers = owners ?? [];
    if (managers.length === 0) {
      const { data: hq } = await admin.from('branch_users').select('phone').eq('role', 'hq_admin').eq('is_active', true);
      managers = hq ?? [];
    }
    for (const m of managers) if (m.phone) phones.add(m.phone);

    if (phones.size === 0) return 0;

    const variables = {
      '#{이름}': assigneeName ?? '담당자',
      '#{지점}': branchName || '비주얼살롱',
      '#{주제}': item.title,
      '#{예정일}': fmtMD(item.scheduled_date),
      '#{경과일}': String(daysOverdue(item.scheduled_date, today)),
    };

    const results = await Promise.all(
      [...phones].map((phone) => sendAlimtalk({ to: phone, templateId: TMPL_PLAN_OVERDUE, variables })),
    );
    return results.filter((r) => r.sent).length;
  } catch {
    // 알림 실패가 일정 기능을 막지 않는다
    return 0;
  }
}
