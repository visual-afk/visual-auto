import { redirect } from 'next/navigation';
import { getMember, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import InterviewsStudio from '@/components/interviews/InterviewsStudio';

export const dynamic = 'force-dynamic';

/** 면담·미팅 — 녹음하면 AI가 기록하고, 구성원 컨디션 이력이 쌓인다 (원장·본사 전용) */
export default async function InterviewsPage() {
  const member = (await getMember())!;
  if (!canManage(member.role)) redirect('/');

  const admin = getAdminSupabase();
  let branchQ = admin.from('branches').select('id, name').order('name');
  if (member.role !== 'hq_admin') {
    branchQ = branchQ.in(
      'id',
      member.branchIds.length > 0 ? member.branchIds : ['00000000-0000-0000-0000-000000000000'],
    );
  }
  const [{ data: branches }, { data: membersData }, { data: mbData }] = await Promise.all([
    branchQ,
    admin
      .from('branch_users')
      .select('id, user_id, display_name, role, branch_id')
      .eq('is_active', true)
      .neq('role', 'hq_admin')
      .order('display_name'),
    admin.from('member_branches').select('user_id, branch_id'),
  ]);

  // 지점별 명부: 홈 지점 ∪ member_branches (멀티 지점 소속 반영)
  const extra = new Map<string, Set<string>>(); // user_id → branch_ids
  for (const r of mbData ?? []) {
    if (!extra.has(r.user_id)) extra.set(r.user_id, new Set());
    extra.get(r.user_id)!.add(r.branch_id);
  }
  const roster = (membersData ?? []).map((m) => {
    const set = new Set<string>(m.branch_id ? [m.branch_id] : []);
    for (const bid of extra.get(m.user_id) ?? []) set.add(bid);
    return { id: m.id, display_name: m.display_name, role: m.role, branch_ids: [...set] };
  });

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">면담·미팅</h1>
      <p className="mt-1 text-sm text-ink-soft">
        개인면담은 녹음만 하면 AI가 기록해요. 미팅은 안건과 참석을 남겨요.
      </p>
      <InterviewsStudio
        branches={branches ?? []}
        roster={roster}
        defaultBranchId={member.branchId ?? branches?.[0]?.id ?? null}
      />
    </div>
  );
}
