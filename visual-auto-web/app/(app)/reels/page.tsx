import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getContentProfile } from '@/lib/reels';
import ReelsStudio, { type BranchOption, type PastReel } from '@/components/ReelsStudio';

export const dynamic = 'force-dynamic';

export default async function ReelsPage() {
  const me = (await getMember())!;
  const isHq = me.role === 'hq_admin';
  const admin = getAdminSupabase();

  const profile = await getContentProfile(me.userId, me.branchId);

  const { data: reels } = await admin
    .from('reels')
    .select('id, title, views, status, created_at, published_url')
    .eq('author_id', me.userId)
    .order('created_at', { ascending: false })
    .limit(20);

  let branches: BranchOption[] = [];
  if (isHq) {
    const { data } = await admin.from('branches').select('id, name').order('name');
    branches = (data ?? []).map((b) => ({ id: b.id, name: b.name }));
  } else if (me.branchId) {
    branches = [{ id: me.branchId, name: me.branchName ?? '' }];
  }

  return (
    <div className="py-6 md:py-0">
      <ReelsStudio
        profile={profile}
        canEditBranch={me.role === 'hq_admin' || me.role === 'branch_owner'}
        pastReels={(reels ?? []) as PastReel[]}
        branches={branches}
        needsBranchPick={isHq}
      />
    </div>
  );
}
