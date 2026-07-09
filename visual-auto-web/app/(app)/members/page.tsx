import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getMember, canManage, roleLabel, type Role } from '@/lib/auth';
import { logAccess } from '@/lib/access-log';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { fetchMemberBranchMap, effectiveBranchIds } from '@/lib/memberBranches';
import { aggregateTeamCoaching, type CoachingInputMember, type MemberCoaching } from '@/lib/coaching';
import type { PeriodType } from '@/lib/metrics';
import InviteForm from '@/components/InviteForm';
import PendingInvite from '@/components/PendingInvite';
import MemberCoachingCard from '@/components/MemberCoachingCard';
import CoachingSummary from '@/components/CoachingSummary';
import PeriodToggle from '@/components/PeriodToggle';

export const dynamic = 'force-dynamic';

type MemberRow = {
  id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  branch_id: string | null;
};
type PendingRow = { id: string; token: string; invitee_name: string | null; role: Role; branch_id: string | null };

/** "원장 1 · 디자이너 2 · 인턴 1" 처럼 역할별 인원 요약 */
function roleSummary(members: MemberRow[]): string {
  const order: Role[] = ['branch_owner', 'designer', 'intern', 'hq_admin'];
  const counts: Partial<Record<Role, number>> = {};
  for (const m of members) counts[m.role] = (counts[m.role] || 0) + 1;
  return order
    .filter((r) => counts[r])
    .map((r) => `${roleLabel[r]} ${counts[r]}`)
    .join(' · ');
}

/** 코칭 카드 정렬: 주의(warn) 먼저 → 이름순. 비활성은 뒤로. */
function sortForCoaching(members: MemberRow[], coaching: Map<string, MemberCoaching>): MemberRow[] {
  return [...members].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const aw = coaching.get(a.user_id)?.status === 'warn' ? 0 : 1;
    const bw = coaching.get(b.user_id)?.status === 'warn' ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.display_name.localeCompare(b.display_name, 'ko');
  });
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const member = (await getMember())!;
  if (!canManage(member.role)) redirect('/');
  const isHq = member.role === 'hq_admin';
  // 본사(전 지점) 또는 여러 지점 소속이면 지점별로 그룹핑해서 보여준다.
  const showGroups = isHq || member.branchIds.length > 1;

  const sp = await searchParams;
  const period: PeriodType = sp.period === 'month' ? 'month' : 'week';
  const periodWord = period === 'week' ? '이번 주' : '이번 달';

  // 멤버 이름·휴대폰을 보는 화면 → 접근 로그
  await logAccess(member, '/members', 'view_members');

  const admin = getAdminSupabase();

  // 멤버 — 홈 지점(branch_id)뿐 아니라 member_branches로 배정된 사람도 포함
  let mq = admin
    .from('branch_users')
    .select('id, user_id, display_name, phone, role, is_active, branch_id')
    .order('created_at');
  if (!isHq) {
    const { data: assignedRows } = await admin
      .from('member_branches')
      .select('user_id')
      .in('branch_id', member.branchIds);
    const assignedIds = [...new Set((assignedRows ?? []).map((r) => r.user_id as string))];
    mq = assignedIds.length
      ? mq.or(`branch_id.in.(${member.branchIds.join(',')}),user_id.in.(${assignedIds.join(',')})`)
      : mq.in('branch_id', member.branchIds);
  }
  const { data: membersData } = await mq;
  const members = (membersData ?? []) as MemberRow[];

  // 수락 대기 초대
  let iq = admin
    .from('invites')
    .select('id, token, invitee_name, role, branch_id')
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  if (!isHq) iq = iq.in('branch_id', member.branchIds);
  const { data: pendingData } = await iq;
  const pending = (pendingData ?? []) as PendingRow[];

  // 지점 목록 (본사: 초대 지점 선택 + 그룹 라벨용)
  // 멤버 초대/지점 배정은 실제 지점만 — 글쓰기 전용 브랜드 제외
  const { data: branchesData } = await admin
    .from('branches')
    .select('id, name')
    .eq('kind', 'salon')
    .order('name');
  const branches = branchesData ?? [];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  // 내가 배정(지점 추가/제거)할 수 있는 지점 (본사=전체 / 원장=소속 지점)
  const assignableBranches = isHq ? branches : branches.filter((b) => member.branchIds.includes(b.id));

  // 각 멤버가 현재 소속된 지점 집합 (그룹핑 + 지점 배정 UI 초기값) — user_id → branch_id[]
  const memberBranchMap = await fetchMemberBranchMap(
    admin,
    members.map((m) => m.user_id),
  );

  // 코칭 지표 (사람별 릴스·블로그·리뷰 + 조회수 + 저장률 → 규칙 기반 코칭)
  const inputMembers: CoachingInputMember[] = members.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    role: m.role,
  }));
  const coaching = await aggregateTeamCoaching(inputMembers, isHq ? null : member.branchIds, period);

  // 요약 배너: 활성 디자이너·인턴 중 주의 대상만
  const flagged = members
    .filter((m) => m.is_active && (m.role === 'designer' || m.role === 'intern'))
    .map((m) => ({ m, c: coaching.get(m.user_id) }))
    .filter((x) => x.c?.status === 'warn')
    .map((x) => ({ name: x.m.display_name, reason: x.c!.primaryFlagLabel ?? '주의' }));

  // 초대 링크 베이스
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'http'}://${h.get('host')}`;

  // 본사=전 지점 / 멀티지점 원장=소속 지점별 그룹 / 단일지점 원장=단일 그룹
  const groupBranches = isHq
    ? branches
    : branches.filter((b) => member.branchIds.includes(b.id));
  const groups = showGroups
    ? groupBranches.map((b) => ({
        key: b.id,
        name: b.name,
        members: members.filter((m) => effectiveBranchIds(memberBranchMap, m.user_id, m.branch_id).includes(b.id)),
        pending: pending.filter((p) => p.branch_id === b.id),
      }))
    : [{ key: 'mine', name: member.branchName ?? '우리 지점', members, pending }];

  // 본사(지점 없음) 멤버·초대는 지점 그룹에 안 걸리므로 별도 그룹으로 (본사만 보임)
  if (showGroups && isHq) {
    const hqMembers = members.filter(
      (m) => m.role === 'hq_admin' && effectiveBranchIds(memberBranchMap, m.user_id, m.branch_id).length === 0,
    );
    const hqPending = pending.filter((p) => !p.branch_id);
    if (hqMembers.length > 0 || hqPending.length > 0) {
      groups.unshift({ key: 'hq', name: '본사', members: hqMembers, pending: hqPending });
    }
  }

  return (
    <div className="py-6 md:py-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isHq ? '지점·사람' : '우리 지점 팀'}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isHq ? `전체 ${members.length}명` : `${member.branchName} · ${roleSummary(members) || '아직 멤버 없음'}`}
          </p>
        </div>
        <PeriodToggle value={period} />
      </div>

      {/* 이번 주(달) 챙길 사람 요약 */}
      {members.length > 0 && <CoachingSummary flagged={flagged} periodWord={periodWord} />}

      {/* 새로 초대하기 */}
      <section className="mt-6 rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-base font-bold">새로 초대하기</h2>
        <InviteForm myRole={member.role} branches={showGroups ? assignableBranches : undefined} />
      </section>

      {/* 지점별(본사) / 단일(원장) 코칭 카드 */}
      <div className="mt-8 space-y-8">
        {groups.map((g) => (
          <section key={g.key}>
            {showGroups && (
              <h2 className="mb-2 text-lg font-bold">
                {g.name}
                <span className="ml-2 text-sm font-normal text-ink-soft">{roleSummary(g.members)}</span>
              </h2>
            )}

            {g.pending.length > 0 && (
              <div className="mb-3 space-y-2">
                {g.pending.map((p) => (
                  <PendingInvite
                    key={p.id}
                    inviteId={p.id}
                    inviteeName={p.invitee_name}
                    role={p.role}
                    link={`${origin}/invite/${p.token}`}
                    branchName={showGroups ? branchName.get(p.branch_id ?? '') : null}
                  />
                ))}
              </div>
            )}

            {g.members.length === 0 ? (
              <p className="rounded-xl2 border border-line bg-surface px-4 py-8 text-center text-sm text-ink-faint">
                아직 멤버가 없어요. 위에서 초대해보세요.
              </p>
            ) : (
              <div className="space-y-3">
                {sortForCoaching(g.members, coaching).map((m) => {
                  const isMe = m.user_id === member.userId;
                  const canAct = !isMe && (isHq || m.role === 'designer' || m.role === 'intern');
                  return (
                    <MemberCoachingCard
                      key={m.id}
                      memberId={m.id}
                      displayName={m.display_name}
                      initialRole={m.role}
                      initialActive={m.is_active}
                      isMe={isMe}
                      canAct={canAct}
                      myRole={member.role}
                      coaching={coaching.get(m.user_id)!}
                      assignableBranches={showGroups ? assignableBranches : []}
                      currentBranchIds={effectiveBranchIds(memberBranchMap, m.user_id, m.branch_id)}
                      homeBranchId={m.branch_id}
                    />
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
