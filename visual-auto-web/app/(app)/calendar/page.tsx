import { getMember, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstThisMonth, kstTodayStr } from '@/lib/kst';
import { fetchCalendarMonth, buildCalendarReport } from '@/lib/contentCalendar';
import ContentCalendar from '@/components/calendar/ContentCalendar';
import CalendarReport from '@/components/calendar/CalendarReport';
import CalendarChat from '@/components/calendar/CalendarChat';
import type { AssigneeOpt, BranchOpt } from '@/components/calendar/ScheduleEditor';

export const dynamic = 'force-dynamic';

/**
 * 콘텐츠 캘린더: 계획(content_schedule) + 실적(posts/reels) 두 레이어 + 월 리포트 + AI 챗.
 * 조회는 전 역할(자기 지점), 일정 등록·리포트·챗은 본사·원장만.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  const me = (await getMember())!;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : kstThisMonth();
  const isHq = me.role === 'hq_admin';
  const isManager = canManage(me.role);
  const admin = getAdminSupabase();

  // 지점 필터 옵션: 본사=전 지점(+전사), 멀티지점=소속 지점, 단일지점=고정
  let branchOpts: BranchOpt[] = [];
  if (isHq) {
    const { data } = await admin.from('branches').select('id, name').order('name');
    branchOpts = (data ?? []) as BranchOpt[];
  } else if (me.branchIds.length > 1) {
    const { data } = await admin.from('branches').select('id, name').in('id', me.branchIds).order('name');
    branchOpts = (data ?? []) as BranchOpt[];
  } else if (me.branchId) {
    branchOpts = [{ id: me.branchId, name: me.branchName ?? '내 지점' }];
  }
  const canPickBranch = isHq || me.branchIds.length > 1;

  // 현재 스코프: ?branch= 검증 → 기본값(본사=전사, 그 외=홈 지점)
  const requested = sp.branch;
  const branchParam =
    requested === 'all' && isHq
      ? 'all'
      : requested && branchOpts.some((b) => b.id === requested)
        ? requested
        : isHq
          ? 'all'
          : (me.branchId ?? branchOpts[0]?.id ?? '');

  if (!branchParam) {
    return <div className="py-10 text-center text-sm text-ink-faint">연결된 지점이 없어요.</div>;
  }

  const scopeBranchIds = branchParam === 'all' ? null : [branchParam];

  // 일정 등록 가능한 지점 (디자이너·인턴은 빈 배열 → 읽기 전용)
  const editableBranches = isManager ? branchOpts : [];

  // 담당자 옵션 (편집 폼용 — 등록 권한자에게만 필요)
  let assignees: AssigneeOpt[] = [];
  if (isManager) {
    let q = admin.from('branch_users').select('id, display_name, branch_id').eq('is_active', true).order('display_name');
    if (!isHq) q = q.in('branch_id', me.branchIds);
    const { data } = await q;
    assignees = ((data ?? []) as { id: string; display_name: string; branch_id: string | null }[]).map((u) => ({
      id: u.id,
      name: u.display_name,
      branchId: u.branch_id,
    }));
  }

  const [monthData, report] = await Promise.all([
    fetchCalendarMonth(scopeBranchIds, month),
    isManager ? buildCalendarReport(scopeBranchIds, month) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6 py-6 md:py-0">
      <h1 className="text-2xl font-bold">콘텐츠 캘린더</h1>

      {report && <CalendarReport report={report} />}

      <ContentCalendar
        month={month}
        todayStr={kstTodayStr()}
        days={monthData.days}
        branchParam={branchParam}
        branchOpts={branchOpts}
        editableBranches={editableBranches}
        canPickBranch={canPickBranch}
        isHq={isHq}
        assignees={assignees}
      />

      {isManager && <CalendarChat month={month} branchParam={branchParam} />}
    </div>
  );
}
