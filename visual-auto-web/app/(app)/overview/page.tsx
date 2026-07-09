import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Siren } from 'lucide-react';
import { getMember, type Role } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { aggregateOpsHealth, fmtDaysAgo, type BranchOpsHealth } from '@/lib/ops-health';
import { fetchMemberBranchMap, effectiveBranchIds } from '@/lib/memberBranches';

export const dynamic = 'force-dynamic';

type Member = { user_id: string; branch_id: string | null; role: Role; is_active: boolean };
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
  const [{ data: branchesData }, { data: membersData }, { data: postsData }, memberBranchMap] = await Promise.all([
    admin.from('branches').select('id, name').order('name'),
    admin.from('branch_users').select('user_id, branch_id, role, is_active').eq('is_active', true),
    admin.from('posts').select('branch_id, views'),
    fetchMemberBranchMap(admin),
  ]);
  const branches = branchesData ?? [];
  const members = (membersData ?? []) as Member[];
  const posts = (postsData ?? []) as Post[];

  // 운영 리듬 (일지·오픈체크·면담·미팅) — 테이블 미적용 환경에서도 페이지가 죽지 않게
  const ops = await aggregateOpsHealth(branches).catch(() => null);

  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
  const totalPeople = members.filter((m) => m.role !== 'hq_admin').length;

  const rows = branches.map((b) => {
    const bMembers = members.filter((m) => effectiveBranchIds(memberBranchMap, m.user_id, m.branch_id).includes(b.id));
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

      {/* 운영 위기 신호 */}
      {ops && ops.crises.length > 0 && (
        <div className="mt-6 rounded-xl2 border border-red-200 bg-red-50 p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
            <Siren size={15} /> 지금 챙겨야 할 신호 {ops.crises.length}건
          </p>
          <ul className="mt-2 space-y-1">
            {ops.crises.slice(0, 6).map((c, i) => (
              <li key={i} className="text-sm text-red-700">
                <span className="font-semibold">{c.branchName}</span> — {c.message}
              </li>
            ))}
            {ops.crises.length > 6 && (
              <li className="text-xs text-red-400">외 {ops.crises.length - 6}건</li>
            )}
          </ul>
        </div>
      )}

      {/* 지점별 운영 리듬 */}
      {ops && (
        <div className="mt-8">
          <h2 className="text-base font-bold">지점 운영 리듬</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            최근 7일 일지·오픈체크, 면담 공백, 마지막 미팅 — 원장이 매장을 돌보는 리듬이에요.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl2 border border-line bg-surface">
            <div className="grid grid-cols-[1fr_3.5rem_4rem_5.5rem_4.5rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
              <span>지점</span>
              <span className="text-right">일지</span>
              <span className="text-right">오픈체크</span>
              <span className="text-right">면담</span>
              <span className="text-right">미팅</span>
            </div>
            <ul className="divide-y divide-line">
              {branches.map((b) => {
                const h = ops.health.get(b.id);
                if (!h) return null;
                return <OpsRow key={b.id} name={b.name} h={h} />;
              })}
            </ul>
          </div>
        </div>
      )}

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

const STATUS_DOT: Record<BranchOpsHealth['status'], string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  crisis: 'bg-red-500',
};

function OpsRow({ name, h }: { name: string; h: BranchOpsHealth }) {
  return (
    <li className="grid grid-cols-[1fr_3.5rem_4rem_5.5rem_4.5rem] items-center gap-2 px-4 py-3">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[h.status]}`} />
        <span className="truncate text-sm font-semibold">{name}</span>
      </span>
      <span className={`text-right text-sm tabular-nums ${h.journalDays7 < 3 ? 'font-semibold text-warn' : 'text-ink-soft'}`}>
        {h.journalDays7}/7일
      </span>
      <span className={`text-right text-sm tabular-nums ${h.openCheckPct7 != null && h.openCheckPct7 < 50 ? 'font-semibold text-warn' : 'text-ink-soft'}`}>
        {h.openCheckPct7 != null ? `${h.openCheckPct7}%` : '–'}
      </span>
      <span className={`truncate text-right text-xs ${h.interviewOverdue > 0 ? 'font-semibold text-warn' : 'text-ink-soft'}`}>
        {h.oldestGap
          ? `${h.oldestGap.name} ${h.oldestGap.days != null ? `${h.oldestGap.days}일` : '없음'}`
          : '괜찮음'}
      </span>
      <span className={`text-right text-xs ${h.lastMeetingDays != null && h.lastMeetingDays > 21 ? 'font-semibold text-warn' : 'text-ink-soft'}`}>
        {fmtDaysAgo(h.lastMeetingDays)}
      </span>
    </li>
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
