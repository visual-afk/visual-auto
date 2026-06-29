import { NextResponse } from 'next/server';
import { requireMember, canManage } from '@/lib/auth';
import { getAdminSupabase, loginIdToEmail } from '@/lib/supabase/admin';

/**
 * 직접 회원 추가 (원장/본사) — 초대 링크 없이 즉시 계정 발급.
 * 본사: 모든 역할(hq_admin 포함). 원장: 자기 지점의 디자이너/인턴만.
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (!canManage(member.role)) {
    return NextResponse.json({ error: '추가 권한이 없어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const displayName: string = (body.display_name || '').trim();
  const phone: string = (body.phone || '').trim().replace(/[^0-9]/g, '');
  const password: string = body.password || 'visual1234';

  if (!displayName || !phone) {
    return NextResponse.json({ error: '이름·휴대폰을 입력해주세요' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 해요' }, { status: 400 });
  }

  const isHq = member.role === 'hq_admin';

  // 추가 가능 역할: 원장은 디자이너/인턴, 본사는 본사/원장/디자이너/인턴
  const allowedRoles = isHq ? ['hq_admin', 'branch_owner', 'designer', 'intern'] : ['designer', 'intern'];
  const role: string = allowedRoles.includes(body.role) ? body.role : 'designer';

  // 지점 결정: 본사는 hq_admin이면 null, 그 외엔 body.branch_id 필수. 원장은 자기 지점.
  let branchId: string | null;
  if (isHq) {
    branchId = role === 'hq_admin' ? null : body.branch_id || null;
    if (role !== 'hq_admin' && !branchId) {
      return NextResponse.json({ error: '지점을 선택해주세요' }, { status: 400 });
    }
  } else {
    branchId = member.branchId;
  }

  const admin = getAdminSupabase();

  // 중복 휴대폰 방지
  const { data: dup } = await admin.from('branch_users').select('id').eq('phone', phone).maybeSingle();
  if (dup) {
    return NextResponse.json({ error: '이미 가입된 휴대폰 번호예요' }, { status: 409 });
  }

  // auth 유저 생성 (synthetic email = 휴대폰 기반)
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

  // 멤버 생성
  const { error: memberErr } = await admin.from('branch_users').insert({
    user_id: created.user.id,
    branch_id: branchId,
    display_name: displayName,
    phone,
    login_id: phone,
    role,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(created.user.id); // 롤백
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, login_id: phone, password });
}
