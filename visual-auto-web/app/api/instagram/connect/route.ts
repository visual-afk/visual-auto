import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireMember } from '@/lib/auth';
import { igAuthorizeUrl, igEnvReady, igRedirectUri } from '@/lib/instagram';

/** 인스타그램 연결 시작 — 인스타 로그인 화면으로 보낸다. */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return NextResponse.redirect(new URL('/login', request.url));

  if (!igEnvReady()) {
    return NextResponse.redirect(new URL('/track?ig=notready', request.url));
  }

  const state = randomUUID();
  const redirect = NextResponse.redirect(igAuthorizeUrl(igRedirectUri(request.url), state));
  // CSRF 방지: state를 쿠키에 심고 callback에서 대조
  redirect.cookies.set('ig_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return redirect;
}
