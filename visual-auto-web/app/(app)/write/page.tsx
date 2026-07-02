import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import WriteStudio from '@/components/WriteStudio';
import type { Post } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function WritePage() {
  const member = (await getMember())!;
  const isHq = member.role === 'hq_admin';
  // 본사(전 지점) 또는 여러 지점 소속이면 글쓰기 시 지점을 골라야 한다.
  const needsBranchPick = isHq || member.branchIds.length > 1;

  const admin = getAdminSupabase();
  // 본사: 전 지점 / 그 외: 본인 소속 지점(들)
  let bq = admin.from('branches').select('id, name, naver_blog_url, imweb_url').order('name');
  if (!isHq) bq = bq.in('id', member.branchIds);
  const [{ data }, { data: drafts }] = await Promise.all([
    bq,
    // 발행 안 한 최신 초안 — 새로고침해도 이어쓰기·발행할 수 있게 넘겨준다
    admin
      .from('posts')
      .select('*')
      .eq('author_id', member.userId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const branches = (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    naverBlogUrl: b.naver_blog_url,
    imwebUrl: b.imweb_url,
  }));

  return (
    <WriteStudio
      branches={branches}
      needsBranchPick={needsBranchPick}
      myNaverUrl={member.myNaverUrl}
      initialPost={(drafts?.[0] as Post | undefined) ?? null}
    />
  );
}
