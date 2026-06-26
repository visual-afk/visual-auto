import { NextResponse } from 'next/server';
import { getAdminSupabase, loginIdToEmail } from '@/lib/supabase/admin';

/** 초대 수락 = 디자이너 가입 (공개 — 단, 유효한 토큰 필수). 이름+휴대폰+비번만. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token: string = (body.token || '').trim();
  const displayName: string = (body.display_name || '').trim();
  const phoneRaw: string = (body.phone || '').trim();
  const password: string = body.password || '';
  const phone = phoneRaw.replace(/[^0-9]/g, ''); // 숫자만 (login_id 기준)

  if (!token || !displayName || !phone || password.length < 4) {
    return NextResponse.json({ error: '이름·휴대폰·비밀번호를 확인해주세요' }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 1) 토큰 검증
  const { data: invite } = await admin.from('invites').select('*').eq('token', token).maybeSingle();
  if (!invite) return NextResponse.json({ error: '유효하지 않은 초대예요' }, { status: 404 });
  if (invite.status === 'accepted') {
    return NextResponse.json({ error: '이미 사용된 초대예요' }, { status: 410 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from('invites').update({ status: 'expired' }).eq('id', invite.id);
    return NextResponse.json({ error: '만료된 초대예요' }, { status: 410 });
  }

  // 2) 동명이인/중복 방지 — 같은 휴대폰 번호는 이미 가입됨
  const { data: dup } = await admin.from('branch_users').select('id').eq('phone', phone).maybeSingle();
  if (dup) {
    return NextResponse.json({ error: '이미 가입된 휴대폰 번호예요' }, { status: 409 });
  }

  // 3) auth 유저 생성 (synthetic email = 휴대폰 기반)
  const email = loginIdToEmail(phone);
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (userErr || !created.user) {
    return NextResponse.json({ error: '계정 생성에 실패했어요 (' + userErr?.message + ')' }, { status: 500 });
  }

  // 4) 멤버 생성 (지점·역할은 토큰에서 — 지점 선택 없음)
  const { error: memberErr } = await admin.from('branch_users').insert({
    user_id: created.user.id,
    branch_id: invite.branch_id,
    display_name: displayName,
    phone,
    login_id: phone,
    role: invite.role,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(created.user.id); // 롤백
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // 5) 초대 사용 처리
  await admin
    .from('invites')
    .update({ status: 'accepted', accepted_by: created.user.id, accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  // 클라이언트는 이 login_id(휴대폰)+비번으로 바로 로그인
  return NextResponse.json({ ok: true, login_id: phone });
}
