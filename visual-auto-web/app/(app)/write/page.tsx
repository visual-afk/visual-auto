import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import WriteStudio from '@/components/WriteStudio';

export const dynamic = 'force-dynamic';

export default async function WritePage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';
  // 본사(전 지점) 또는 여러 지점 소속이면 글쓰기 시 지점을 골라야 한다.
  const needsBranchPick = isHq || member.branchIds.length > 1;

  // 본사: 전 지점 / 그 외: 본인 소속 지점(들)
  let bq = getAdminSupabase().from('branches').select('id, name, naver_blog_url, imweb_url').order('name');
  if (!isHq) bq = bq.in('id', member.branchIds);
  const { data } = await bq;
  const branches = (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    naverBlogUrl: b.naver_blog_url,
    imwebUrl: b.imweb_url,
  }));

  return <WriteStudio branches={branches} needsBranchPick={needsBranchPick} myNaverUrl={member.myNaverUrl} />;
}
