import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getMember, canManage, roleLabel, type Role } from '@/lib/auth';
import { logAccess } from '@/lib/access-log';
import { getAdminSupabase } from '@/lib/supabase/admin';
import InviteForm from '@/components/InviteForm';
import MemberActions from '@/components/MemberActions';
import PendingInvite from '@/components/PendingInvite';

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

export default async function MembersPage() {
  const member = (await getMember())!;
  if (!canManage(member.role)) redirect('/');
  const isHq = member.role === 'hq_admin';

  // 멤버 이름·휴대폰을 보는 화면 → 접근 로그
  await logAccess(member, '/members', 'view_members');

  const admin = getAdminSupabase();

  // 멤버
  let mq = admin
    .from('branch_users')
    .select('id, user_id, display_name, phone, role, is_active, branch_id')
    .order('created_at');
  if (!isHq) mq = mq.eq('branch_id', member.branchId!);
  const { data: membersData } = await mq;
  const members = (membersData ?? []) as MemberRow[];

  // 수락 대기 초대
  let iq = admin
    .from('invites')
    .select('id, token, invitee_name, role, branch_id')
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  if (!isHq) iq = iq.eq('branch_id', member.branchId!);
  const { data: pendingData } = await iq;
  const pending = (pendingData ?? []) as PendingRow[];

  // 지점 목록 (본사: 초대 지점 선택 + 그룹 라벨용)
  const { data: branchesData } = await admin.from('branches').select('id, name').order('name');
  const branches = branchesData ?? [];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  // 이번 달 글 수 (author_id 별)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthPosts } = await admin.from('posts').select('author_id').gte('created_at', monthStart);
  const postCount = new Map<string, number>();
  for (const p of monthPosts ?? []) postCount.set(p.author_id, (postCount.get(p.author_id) || 0) + 1);

  // 초대 링크 베이스
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'http'}://${h.get('host')}`;

  // 본사면 지점별 그룹, 원장이면 단일 그룹
  const groups = isHq
    ? branches
        .map((b) => ({
          key: b.id,
          name: b.name,
          members: members.filter((m) => m.branch_id === b.id),
          pending: pending.filter((p) => p.branch_id === b.id),
        }))
        .filter((g) => g.members.length || g.pending.length)
    : [{ key: 'mine', name: member.branchName ?? '우리 지점', members, pending }];

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">{isHq ? '지점·사람' : '우리 지점 사람'}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {isHq ? `전체 ${members.length}명` : `${member.branchName} · ${roleSummary(members) || '아직 멤버 없음'}`}
      </p>

      {/* 새로 초대하기 */}
      <section className="mt-6 rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-base font-bold">새로 초대하기</h2>
        <InviteForm myRole={member.role} branches={isHq ? branches : undefined} />
      </section>

      {/* 지점별(본사) / 단일(원장) 멤버 목록 */}
      <div className="mt-8 space-y-8">
        {groups.map((g) => (
          <section key={g.key}>
            {isHq && (
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
                    branchName={isHq ? branchName.get(p.branch_id ?? '') : null}
                  />
                ))}
              </div>
            )}

            <div className="rounded-xl2 border border-line bg-surface">
              <div className="grid grid-cols-[1fr_5.5rem_5rem_2rem] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
                <span>이름</span>
                <span>역할</span>
                <span>이번 달</span>
                <span />
              </div>
              {g.members.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-ink-faint">아직 멤버가 없어요. 위에서 초대해보세요.</p>
              )}
              <ul className="divide-y divide-line">
                {g.members.map((m) => {
                  const isMe = m.user_id === member.userId;
                  const canAct = !isMe && (isHq || m.role === 'designer' || m.role === 'intern');
                  return (
                    <li
                      key={m.id}
                      className={`grid grid-cols-[1fr_5.5rem_5rem_2rem] items-center gap-2 px-4 py-3.5 ${
                        m.is_active ? '' : 'opacity-50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-wash text-sm font-bold text-brand">
                          {m.display_name.slice(0, 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {m.display_name}
                            {isMe && <span className="ml-1 text-xs font-normal text-ink-faint">(나)</span>}
                          </span>
                          {m.phone && <span className="block truncate text-xs text-ink-faint">{m.phone}</span>}
                        </span>
                      </span>
                      <span>
                        <RoleBadge role={m.role} />
                        {!m.is_active && <span className="ml-1 text-xs text-warn">(나감)</span>}
                      </span>
                      <span className="text-sm text-ink-soft">글 {postCount.get(m.user_id) || 0}</span>
                      <span className="flex justify-end">
                        {canAct && (
                          <MemberActions
                            memberId={m.id}
                            memberRole={m.role}
                            isActive={m.is_active}
                            myRole={member.role}
                          />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    hq_admin: 'bg-ink/10 text-ink',
    branch_owner: 'bg-brand-wash text-brand',
    designer: 'bg-canvas text-ink-soft border border-line',
    intern: 'bg-warn/15 text-warn',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${styles[role]}`}>{roleLabel[role]}</span>;
}
