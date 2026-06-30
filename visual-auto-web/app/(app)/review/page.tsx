import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import ReviewStudio, { type BranchOption } from '@/components/ReviewStudio';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';

  let branches: BranchOption[];
  if (isHq) {
    const { data } = await getAdminSupabase().from('branches').select('id, name').order('name');
    branches = (data ?? []).map((b) => ({ id: b.id, name: b.name }));
  } else {
    branches = member.branchId ? [{ id: member.branchId, name: member.branchName ?? '' }] : [];
  }

  return (
    <div className="py-6 md:py-0">
      <ReviewStudio branches={branches} needsBranchPick={isHq} />
    </div>
  );
}
