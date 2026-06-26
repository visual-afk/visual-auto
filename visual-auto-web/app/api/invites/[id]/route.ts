import { NextResponse } from 'next/server';
import { requireMember, canManage } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 초대 취소 (수락 대기 중인 초대 삭제). 원장은 자기 지점, 본사는 전체. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });

  const { id } = await params;
  const admin = getAdminSupabase();
  const { data: invite } = await admin
    .from('invites')
    .select('id, branch_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: '초대를 찾을 수 없어요' }, { status: 404 });
  if (member.role === 'branch_owner' && invite.branch_id !== member.branchId) {
    return NextResponse.json({ error: '다른 지점 초대는 취소할 수 없어요' }, { status: 403 });
  }

  const { error } = await admin.from('invites').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
