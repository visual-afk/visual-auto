import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 본인 개인 네이버 블로그 글쓰기 링크 저장/해제 (로그인한 본인만) */
export async function PATCH(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const raw: string = (body.naver_blog_url || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) {
    return NextResponse.json({ error: 'http로 시작하는 주소를 넣어주세요' }, { status: 400 });
  }
  const naverUrl = raw || null; // 빈 값이면 해제

  const admin = getAdminSupabase();
  const { error } = await admin
    .from('branch_users')
    .update({ naver_blog_url: naverUrl })
    .eq('user_id', member.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, naver_blog_url: naverUrl });
}
