import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { aggregateBranch, fetchComparisonBundle, type PeriodType } from '@/lib/metrics';
import PerformanceDashboard, { type BranchOpt } from '@/components/PerformanceDashboard';
import ComparisonChartSection from '@/components/ComparisonChartSection';

export const dynamic = 'force-dynamic';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** 기간 네비게이션 — 월간은 달 단위, 주간은 월~일 주 단위로 이전/다음 ref 계산 */
function buildPeriodNav(period: PeriodType, refDate: string) {
  const base = new Date(refDate + 'T00:00:00Z');
  const todayIso = isoDay(new Date());
  if (period === 'week') {
    const monday = new Date(base);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const prev = new Date(monday);
    prev.setUTCDate(prev.getUTCDate() - 7);
    const next = new Date(monday);
    next.setUTCDate(next.getUTCDate() + 7);
    return { prevRef: isoDay(prev), nextRef: isoDay(next), canGoNext: isoDay(next) <= todayIso };
  }
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1));
  return {
    prevRef: isoDay(new Date(Date.UTC(y, m - 1, 1))),
    nextRef: isoDay(next),
    canGoNext: isoDay(next) <= todayIso,
  };
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; period?: string; ref?: string }>;
}) {
  const me = (await getMember())!;
  if (me.role === 'designer' || me.role === 'intern') redirect('/track');

  const sp = await searchParams;
  const period: PeriodType = sp.period === 'week' ? 'week' : 'month';
  // 기준일: ?ref=YYYY-MM-DD (유효하지 않으면 오늘)
  const refParam =
    sp.ref && /^\d{4}-\d{2}-\d{2}$/.test(sp.ref) && !isNaN(new Date(sp.ref + 'T00:00:00Z').getTime())
      ? sp.ref
      : null;
  const refDate = refParam ?? isoDay(new Date());
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

  const [data, comparisonBundle, { data: earliest }] = await Promise.all([
    aggregateBranch(branchId, period, refDate),
    fetchComparisonBundle(branchId, refDate),
    admin.from('metrics_daily').select('date').order('date', { ascending: true }).limit(1).maybeSingle(),
  ]);

  // 월 점프 드롭다운: 데이터가 있는 가장 이른 달 ~ 이번 달 (최신순)
  const nav = buildPeriodNav(period, refDate);
  const monthOptions: { ref: string; label: string }[] = [];
  {
    const from = (earliest as { date?: string } | null)?.date ?? isoDay(new Date());
    const cur = new Date();
    let y = cur.getUTCFullYear();
    let m = cur.getUTCMonth();
    const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1];
    while (y > fy || (y === fy && m >= fm)) {
      monthOptions.push({ ref: isoDay(new Date(Date.UTC(y, m, 1))), label: `${y}년 ${m + 1}월` });
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
  }

  // 마지막 동기화 시각
  const { data: last } = await admin
    .from('metrics_daily')
    .select('created_at')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 하이드레이션 안전: 날짜 포맷은 서버에서 1회만(KST 고정) → 클라이언트는 문자열 그대로 사용
  const lastSyncedAt = (last as { created_at?: string } | null)?.created_at ?? null;
  const syncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      })
    : '동기화 없음';

  return (
    <div className="space-y-8 py-6 md:py-0">
      <PerformanceDashboard
        data={data}
        period={period}
        branchId={branchId}
        branchName={branchName}
        branchOpts={branchOpts}
        isHq={me.role === 'hq_admin'}
        syncedLabel={syncedLabel}
        refDate={refDate}
        prevRef={nav.prevRef}
        nextRef={nav.nextRef}
        canGoNext={nav.canGoNext}
        monthOptions={monthOptions}
      />
      {data.hasData && <ComparisonChartSection bundle={comparisonBundle} />}
    </div>
  );
}
