import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { getMember, type Role } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Member = { branch_id: string | null; role: Role; is_active: boolean };
type Post = { branch_id: string; views: number | null };

/** "원장1·디4·인1" 컴팩트 구성 (0은 생략) */
function compactComposition(members: Member[]): string {
  const owner = members.filter((m) => m.role === 'branch_owner').length;
  const designer = members.filter((m) => m.role === 'designer').length;
  const intern = members.filter((m) => m.role === 'intern').length;
  const parts: string[] = [];
  if (owner) parts.push(`원장${owner}`);
  if (designer) parts.push(`디${designer}`);
  if (intern) parts.push(`인${intern}`);
  return parts.join('·') || '멤버 없음';
}

export default async function OverviewPage() {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const admin = getAdminSupabase();
  const [{ data: branchesData }, { data: membersData }, { data: postsData }] = await Promise.all([
    admin.from('branches').select('id, name').order('name'),
    admin.from('branch_users').select('branch_id, role, is_active').eq('is_active', true),
    admin.from('posts').select('branch_id, views'),
  ]);
  const branches = branchesData ?? [];
  const members = (membersData ?? []) as Member[];
  const posts = (postsData ?? []) as Post[];

  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPeople = members.filter((m) => m.role !== 'hq_admin').length;

  const rows = branches.map((b) => {
    const bMembers = members.filter((m) => m.branch_id === b.id);
    const bPosts = posts.filter((p) => p.branch_id === b.id);
    return {
      id: b.id,
      name: b.name,
      composition: compactComposition(bMembers),
      hasOwner: bMembers.some((m) => m.role === 'branch_owner'),
      posts: bPosts.length,
      views: bPosts.reduce((s, p) => s + (p.views || 0), 0),
    };
  });

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">전체 현황</h1>

      {/* KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="지점" value={branches.length.toLocaleString()} />
        <Kpi label="사람" value={totalPeople.toLocaleString()} />
        <Kpi label="올린 글" value={posts.length.toLocaleString()} />
        <Kpi label="총 조회수" value={totalViews.toLocaleString()} accent />
      </div>

      {/* 지점별 롤업 */}
      <div className="mt-8 overflow-hidden rounded-xl2 border border-line bg-surface">
        <div className="grid grid-cols-[1fr_8rem_3.5rem_5rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint md:grid-cols-[1fr_10rem_4rem_6rem]">
          <span>지점</span>
          <span>사람</span>
          <span className="text-right">글</span>
          <span className="text-right">조회수</span>
        </div>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">아직 등록된 지점이 없어요.</p>
        )}
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[1fr_8rem_3.5rem_5rem] items-center gap-2 px-4 py-3.5 md:grid-cols-[1fr_10rem_4rem_6rem]"
            >
              <Link href="/members" className="truncate font-semibold hover:text-brand">
                {r.name}
              </Link>
              <span className="truncate text-sm">
                {r.hasOwner ? (
                  <span className="text-ink-soft">{r.composition}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warn">
                    <AlertCircle size={14} /> 원장 없음
                  </span>
                )}
              </span>
              <span className="text-right text-sm text-ink-soft">{r.posts}</span>
              <span className="text-right text-sm font-bold text-brand">{r.views.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? 'text-brand' : ''}`}>{value}</p>
    </div>
  );
}
