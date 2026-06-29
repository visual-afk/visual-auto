import { redirect } from 'next/navigation';
import { Info } from 'lucide-react';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import BranchForm from '@/components/BranchForm';
import BranchActions, { type BranchRowData } from '@/components/BranchActions';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const admin = getAdminSupabase();
  const [{ data: branchesData }, { data: members }, { data: posts }] = await Promise.all([
    admin.from('branches').select('id, name, region, knowledge_slug, naver_blog_url, imweb_url').order('name'),
    admin.from('branch_users').select('branch_id'),
    admin.from('posts').select('branch_id'),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of members ?? []) if (m.branch_id) memberCount.set(m.branch_id, (memberCount.get(m.branch_id) || 0) + 1);
  const postCount = new Map<string, number>();
  for (const p of posts ?? []) if (p.branch_id) postCount.set(p.branch_id, (postCount.get(p.branch_id) || 0) + 1);

  const branches: BranchRowData[] = (branchesData ?? []).map((b) => ({
    ...b,
    member_count: memberCount.get(b.id) || 0,
    post_count: postCount.get(b.id) || 0,
  }));

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">지점 관리</h1>
      <p className="mt-1 text-sm text-ink-soft">전체 {branches.length}개 지점</p>

      {/* 새 지점 추가 */}
      <section className="mt-6 rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-base font-bold">새 지점 추가</h2>
        <BranchForm />
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-canvas p-3 text-sm text-ink-soft">
          <Info size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>
            지점을 만들어도 지식베이스 파일(<code>knowledge/consumer/branch-슬러그.md</code>,{' '}
            <code>seo/keywords-슬러그.md</code>)은 자동 생성되지 않아요. 글 품질을 위해 따로 추가해주세요.
          </span>
        </div>
      </section>

      {/* 지점 목록 */}
      <div className="mt-8 overflow-hidden rounded-xl2 border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
          <span className="flex-1">지점</span>
          <span>멤버</span>
          <span>글</span>
          <span className="w-7" />
        </div>
        {branches.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">아직 등록된 지점이 없어요. 위에서 추가해보세요.</p>
        )}
        <ul className="divide-y divide-line">
          {branches.map((b) => (
            <BranchActions key={b.id} branch={b} />
          ))}
        </ul>
      </div>
    </div>
  );
}
