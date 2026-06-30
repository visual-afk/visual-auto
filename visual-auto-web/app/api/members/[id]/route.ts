import { NextResponse } from 'next/server';
import { requireMember, canManage, type Role } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

type TargetMember = { id: string; user_id: string; role: Role; branch_id: string | null; is_active: boolean };

/**
 * 권한 가드: 현재 멤버가 대상 멤버를 관리(역할변경/퇴출)할 수 있는지.
 *  - 본사: 자기 자신 제외 누구나
 *  - 원장: 자기 지점의 디자이너/인턴만 (다른 원장·본사·자기자신 불가)
 */
function assertCanActOn(
  actor: { role: Role; branchId: string | null; memberId: string },
  target: TargetMember,
): string | null {
  if (target.id === actor.memberId) return '본인은 변경할 수 없어요';
  if (actor.role === 'hq_admin') return null;
  // branch_owner
  if (target.branch_id !== actor.branchId) return '다른 지점 멤버는 관리할 수 없어요';
  if (target.role !== 'designer' && target.role !== 'intern') return '디자이너·인턴만 관리할 수 있어요';
  return null;
}

async function loadTarget(id: string): Promise<TargetMember | null> {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('branch_users')
    .select('id, user_id, role, branch_id, is_active')
    .eq('id', id)
    .maybeSingle();
  return (data as TargetMember) ?? null;
}

/** 비활성화/다시활성화 + 역할변경 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });

  const { id } = await params;
  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: '멤버를 찾을 수 없어요' }, { status: 404 });

  const guard = assertCanActOn(member, target);
  if (guard) return NextResponse.json({ error: guard }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const admin = getAdminSupabase();

  if (body.action === 'set_active') {
    const isActive = !!body.is_active;
    const { error } = await admin.from('branch_users').update({ is_active: isActive }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'set_role') {
    const newRole: string = body.role;
    // 원장은 디자이너↔인턴만, 본사는 원장/디자이너/인턴 전환 가능 (본사 역할 부여는 불가)
    const allowed: string[] =
      member.role === 'hq_admin' ? ['branch_owner', 'designer', 'intern'] : ['designer', 'intern'];
    if (!allowed.includes(newRole)) {
      return NextResponse.json({ error: '바꿀 수 없는 역할이에요' }, { status: 400 });
    }
    if (newRole === 'branch_owner' && !target.branch_id) {
      return NextResponse.json({ error: '지점이 없는 멤버는 원장으로 지정할 수 없어요' }, { status: 400 });
    }
    const { error } = await admin.from('branch_users').update({ role: newRole }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '알 수 없는 요청이에요' }, { status: 400 });
}

/** 완전삭제 (본사 전용) — auth 계정 삭제 → branch_users·posts 는 cascade 로 함께 삭제 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '완전삭제는 본사만 할 수 있어요' }, { status: 403 });
  }

  const { id } = await params;
  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: '멤버를 찾을 수 없어요' }, { status: 404 });
  if (target.id === member.memberId) {
    return NextResponse.json({ error: '본인은 삭제할 수 없어요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(target.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
