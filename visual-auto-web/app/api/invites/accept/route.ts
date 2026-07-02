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

  // 2) 이미 계정이 있는 사람 → 새 계정을 만들지 않고, 이 지점을 기존 계정에 추가한다.
  //    ("각 지점당 한 번만" — 한 사람은 한 계정으로 여러 지점 소속)
  const { data: dup } = await admin
    .from('branch_users')
    .select('id, user_id, branch_id')
    .eq('phone', phone)
    .maybeSingle();
  if (dup) {
    if (dup.branch_id !== invite.branch_id) {
      const { error: mbErr } = await admin
        .from('member_branches')
        .upsert({ user_id: dup.user_id, branch_id: invite.branch_id }, { onConflict: 'user_id,branch_id' });
      if (mbErr) return NextResponse.json({ error: mbErr.message }, { status: 500 });
    }
    await admin
      .from('invites')
      .update({ status: 'accepted', accepted_by: dup.user_id, accepted_at: new Date().toISOString() })
      .eq('id', invite.id);
    return NextResponse.json({
      ok: true,
      existing: true,
      login_id: phone,
      message: '이미 계정이 있어요. 기존 아이디·비밀번호로 로그인하면 이 지점도 함께 보여요.',
    });
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
