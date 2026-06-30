import { NextResponse } from 'next/server';
import { requireMember, canManage } from '@/lib/auth';
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
  if (member.role === 'branch_owner') q = q.eq('branch_id', member.branchId!);
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

  // 원장은 자기 지점에만, 본사는 body.branch_id 지정 필수
  const branchId =
    member.role === 'hq_admin' && body.branch_id ? body.branch_id : member.branchId;
  if (!branchId) {
    return NextResponse.json({ error: '지점을 선택해주세요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
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

  // 지점명(알림톡 문구용) — 원장은 본인 지점, 본사는 선택한 지점
  let branchName = member.branchName || '';
  if (!branchName) {
    const { data: br } = await admin.from('branches').select('name').eq('id', branchId).maybeSingle();
    branchName = br?.name || '비주얼살롱';
  }

  // 초대받는 사람 번호로 가입 링크 카톡 자동 발송 (번호 있고 키 설정됐을 때).
  // 실패해도 초대 자체는 유효 — 화면의 '링크 복사'로 폴백 가능.
  let kakaoSent = false;
  if (inviteeContact) {
    const r = await sendInviteAlimtalk({
      toPhone: inviteeContact,
      inviteeName,
      branchName,
      token: data.token,
    });
    kakaoSent = r.sent;
  }

  return NextResponse.json({ token: data.token, link, kakaoSent });
}
