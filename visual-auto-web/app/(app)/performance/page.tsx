import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { aggregateBranch, type PeriodType } from '@/lib/metrics';
import PerformanceDashboard, { type BranchOpt } from '@/components/PerformanceDashboard';

export const dynamic = 'force-dynamic';

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; period?: string }>;
}) {
  const me = (await getMember())!;
  if (me.role === 'designer' || me.role === 'intern') redirect('/track');

  const sp = await searchParams;
  const period: PeriodType = sp.period === 'week' ? 'week' : 'month';
  const admin = getAdminSupabase();

  // 본사: 지점 선택 / 원장: 자기 지점
  let branchOpts: BranchOpt[] = [];
  let branchId: string | null = me.branchId;
  let branchName = me.branchName;
  if (me.role === 'hq_admin') {
    const { data } = await admin.from('branches').select('id, name, handsos_pk').order('name');
    branchOpts = (data ?? []).map((b) => ({ id: b.id, name: b.name, hasSource: !!b.handsos_pk }));
    branchId = sp.branch || branchOpts.find((b) => b.hasSource)?.id || branchOpts[0]?.id || null;
    branchName = branchOpts.find((b) => b.id === branchId)?.name ?? null;
  }

  if (!branchId) {
    return (
      <div className="py-10 text-center text-sm text-ink-faint">연결된 지점이 없어요.</div>
    );
  }

  const data = await aggregateBranch(branchId, period);

  // 마지막 동기화 시각
  const { data: last } = await admin
    .from('metrics_daily')
    .select('created_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="py-6 md:py-0">
      <PerformanceDashboard
        data={data}
        period={period}
        branchId={branchId}
        branchName={branchName}
        branchOpts={branchOpts}
        isHq={me.role === 'hq_admin'}
        lastSyncedAt={(last as { created_at?: string } | null)?.created_at ?? null}
      />
    </div>
  );
}
