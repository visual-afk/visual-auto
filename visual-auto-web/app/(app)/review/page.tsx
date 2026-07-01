import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import ReviewStudio, { type BranchOption } from '@/components/ReviewStudio';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';
  const admin = getAdminSupabase();

  let branches: BranchOption[];
  if (isHq) {
    const { data } = await admin
      .from('branches')
      .select('id, name, naver_place_id, naver_short_url')
      .order('name');
    branches = (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      naverPlaceId: b.naver_place_id ?? null,
      naverShortUrl: b.naver_short_url ?? null,
    }));
  } else if (member.branchId) {
    const { data: b } = await admin
      .from('branches')
      .select('id, name, naver_place_id, naver_short_url')
      .eq('id', member.branchId)
      .maybeSingle();
    branches = b
      ? [
          {
            id: b.id,
            name: b.name,
            naverPlaceId: b.naver_place_id ?? null,
            naverShortUrl: b.naver_short_url ?? null,
          },
        ]
      : [];
  } else {
    branches = [];
  }

  return (
    <div className="py-6 md:py-0">
      <ReviewStudio branches={branches} needsBranchPick={isHq} />
    </div>
  );
}
