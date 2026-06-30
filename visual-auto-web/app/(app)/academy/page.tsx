import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { aggregateMarketing, type PeriodType } from '@/lib/metrics';
import AcademyDashboard from '@/components/AcademyDashboard';

export const dynamic = 'force-dynamic';

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const sp = await searchParams;
  const period: PeriodType = sp.period === 'week' ? 'week' : 'month';
  const data = await aggregateMarketing(period);

  return (
    <div className="py-6 md:py-0">
      <AcademyDashboard data={data} period={period} />
    </div>
  );
}
