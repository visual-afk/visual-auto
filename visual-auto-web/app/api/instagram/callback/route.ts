import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { igExchangeCode, igRedirectUri } from '@/lib/instagram';

/** 인스타 OAuth 콜백 — 토큰 교환 후 계정 저장, 앱으로 복귀 */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return NextResponse.redirect(new URL('/login', request.url));
  const { member } = res;

  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/track?ig=${q}`, request.url));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (await cookies()).get('ig_oauth_state')?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return back('denied');
  }

  try {
    const acc = await igExchangeCode(code, igRedirectUri(request.url));
    await getAdminSupabase().from('instagram_accounts').upsert(
      {
        user_id: member.userId,
        ig_user_id: acc.igUserId,
        username: acc.username,
        access_token: acc.accessToken,
        token_expires_at: acc.expiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    const done = back('connected');
    done.cookies.delete('ig_oauth_state');
    return done;
  } catch (e) {
    console.error('[instagram] callback failed:', (e as Error).message);
    return back('error');
  }
}
