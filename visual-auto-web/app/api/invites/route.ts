import { NextResponse } from 'next/server';
import { requireMember, canManage, canActOnBranch, isMultiBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sendInviteAlimtalk } from '@/lib/notifications/invites';

/** 요청이 들어온 실제 도메인에서 초대 링크 베이스를 뽑는다 (로컬·Vercel 프리뷰·프로덕션 자동 대응). */
function getOrigin(request: Request): string {
  const h = request.headers;
  const proto = h.get('x-forwarded-proto') || 'https';
  const host = h.get('x-forwarded-host') || h.get('host');
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

/** 초대 목록 (원장/본사) — 멤버관리 화면의 "수락 대기" 표시용 */
export async function GET() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });
  }

  const admin = getAdminSupabase();
  let q = admin.from('invites').select('*').order('created_at', { ascending: false });
  if (member.role !== 'hq_admin') q = q.in('branch_id', member.branchIds);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data });
}

/** 초대 생성 (원장/본사) → 링크 반환 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '초대 권한이 없어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const inviteeName: string = (body.invitee_name || '').trim();
  const inviteeContact: string = (body.invitee_contact || '').trim();

  // 초대 가능한 역할: 원장은 디자이너/인턴, 본사는 원장도 가능
  const allowedRoles: string[] =
    member.role === 'hq_admin' ? ['branch_owner', 'designer', 'intern'] : ['designer', 'intern'];
  const role: string = allowedRoles.includes(body.role) ? body.role : 'designer';

  // 지점 결정: 본사/멀티지점은 body.branch_id 지정(소속 검증), 단일지점 원장은 자기 지점
  let branchId: string | null;
  if (isMultiBranch(member)) {
    branchId = body.branch_id || null;
    if (!branchId) return NextResponse.json({ error: '지점을 선택해주세요' }, { status: 400 });
    if (!canActOnBranch(member, branchId)) {
      return NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 });
    }
  } else {
    branchId = member.branchId;
  }
  if (!branchId) {
    return NextResponse.json({ error: '지점을 선택해주세요' }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 휴대폰 번호 정규화 (중복 방지·기존 계정 조회 키)
  const phone = inviteeContact.replace(/[^0-9]/g, '');

  // ── "각 지점당 한 번만" 가드 ──────────────────────────────────────
  if (phone) {
    // 1) 이미 이 사람이 계정을 가지고 있으면 → 새 초대·새 계정 대신 해당 지점에 바로 추가
    const { data: existing } = await admin
      .from('branch_users')
      .select('user_id, display_name, branch_id')
      .eq('phone', phone)
      .maybeSingle();
    if (existing) {
      if (existing.branch_id === branchId) {
        return NextResponse.json({ error: '이미 이 지점 멤버예요' }, { status: 409 });
      }
      const { error: mbErr } = await admin
        .from('member_branches')
        .upsert({ user_id: existing.user_id, branch_id: branchId }, { onConflict: 'user_id,branch_id' });
      if (mbErr) {
        return NextResponse.json(
          { error: '기존 회원을 이 지점에 추가하지 못했어요 (' + mbErr.message + ')' },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        added_existing: true,
        message: `${existing.display_name}님을 이 지점에도 추가했어요 (초대 없이 바로 반영).`,
      });
    }

    // 2) 같은 지점에 이미 대기 중인 초대가 있으면 중복 방지
    const { data: dupInvite } = await admin
      .from('invites')
      .select('id')
      .eq('branch_id', branchId)
      .eq('invitee_contact', inviteeContact)
      .eq('status', 'sent')
      .maybeSingle();
    if (dupInvite) {
      return NextResponse.json({ error: '이미 이 지점으로 보낸 초대가 있어요 (수락 대기 중)' }, { status: 409 });
    }
  }

  const { data, error } = await admin
    .from('invites')
    .insert({
      branch_id: branchId,
      role,
      invitee_name: inviteeName || null,
      invitee_contact: inviteeContact || null,
      invited_by: member.userId,
    })
    .select('token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const link = `${getOrigin(request)}/invite/${data.token}`;

  // 연락처가 있으면 카카오 초대장 자동 발송(실패해도 초대는 유효 → 링크 복사로 안내)
  let sent = false;
  if (inviteeContact) {
    const { data: b } = await admin.from('branches').select('name').eq('id', branchId).maybeSingle();
    const r = await sendInviteAlimtalk({
      toPhone: inviteeContact,
      inviteeName,
      branchName: b?.name || '',
      token: data.token,
    });
    sent = r.sent;
  }

  return NextResponse.json({ token: data.token, link, sent });
}
