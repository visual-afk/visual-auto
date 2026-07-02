import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import ReviewStudio, { type BranchOption } from '@/components/ReviewStudio';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';
  const needsBranchPick = isHq || member.branchIds.length > 1;
  const admin = getAdminSupabase();

  let bq = admin.from('branches').select('id, name, naver_place_id, naver_short_url').order('name');
  if (!isHq) bq = bq.in('id', member.branchIds);
  const { data } = await bq;
  const branches: BranchOption[] = (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    naverPlaceId: b.naver_place_id ?? null,
    naverShortUrl: b.naver_short_url ?? null,
  }));

  return (
    <div className="py-6 md:py-0">
      <ReviewStudio branches={branches} needsBranchPick={needsBranchPick} />
    </div>
  );
}
