import { notFound } from 'next/navigation';
import { getMember, canActOnBranch } from '@/lib/auth';
import { logAccess } from '@/lib/access-log';
import { getAdminSupabase } from '@/lib/supabase/admin';
import ViewsForm from '@/components/ViewsForm';

export const dynamic = 'force-dynamic';

export default async function TrackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = (await getMember())!;
  const admin = getAdminSupabase();
  const { data: post } = await admin
    .from('posts')
    .select('id, title, status, published_url, views, saves, next_check_at, branch_id')
    .eq('id', id)
    .maybeSingle();

  // 같은 지점(들)만 접근 (본사는 전체)
  if (!post || !canActOnBranch(member, post.branch_id)) notFound();

  // 글 상세 조회 → 접근 로그
  await logAccess(member, `/track/${id}`, 'view_post');

  return (
    <div className="py-6 md:max-w-md">
      <h1 className="text-2xl font-bold">올린 글, 잘 됐어요?</h1>
      <p className="mt-1 text-sm text-ink-soft">링크랑 조회수만 알려줘요</p>
      <p className="mt-4 rounded-2xl bg-canvas px-4 py-3 font-semibold">{post.title || '제목 없음'}</p>
      <div className="mt-5">
        <ViewsForm
          id={post.id}
          initialUrl={post.published_url}
          initialViews={post.views}
          initialSaves={post.saves}
          initialRemind={!!post.next_check_at}
        />
      </div>
    </div>
  );
}
