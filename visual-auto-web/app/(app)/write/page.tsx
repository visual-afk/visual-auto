import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import WriteStudio from '@/components/WriteStudio';

export const dynamic = 'force-dynamic';

export default async function WritePage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';

  // 본사: 전 지점 선택 가능 / 그 외: 본인 지점 1개
  let branches: { id: string; name: string; naverBlogUrl: string | null; imwebUrl: string | null }[];
  if (isHq) {
    const { data } = await getAdminSupabase()
      .from('branches')
      .select('id, name, naver_blog_url, imweb_url')
      .order('name');
    branches = (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      naverBlogUrl: b.naver_blog_url,
      imwebUrl: b.imweb_url,
    }));
  } else {
    branches = member.branchId
      ? [{ id: member.branchId, name: member.branchName ?? '', naverBlogUrl: member.naverBlogUrl, imwebUrl: member.imwebUrl }]
      : [];
  }

  return <WriteStudio branches={branches} needsBranchPick={isHq} />;
}
