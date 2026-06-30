/**
 * HandSOS 로그인 — python/auth.py 이식.
 * Node fetch 기반 + 수동 쿠키잿(undici는 쿠키 자동관리 안 함).
 */

import { createHash } from 'crypto';
import { COMPANY_ID, USER_ID, HANDSOS_PW, URLS, HTTP_HEADERS } from './config';

export class CookieJar {
  private jar = new Map<string, string>();

  /** 응답의 Set-Cookie 들을 저장 */
  store(res: Response) {
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    const list = anyHeaders.getSetCookie ? anyHeaders.getSetCookie() : [];
    const raw = list.length ? list : res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : [];
    for (const line of raw) {
      const first = line.split(';')[0];
      const eq = first.indexOf('=');
      if (eq > 0) {
        const name = first.slice(0, eq).trim();
        const value = first.slice(eq + 1).trim();
        if (name) this.jar.set(name, value);
      }
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  names(): string[] {
    return [...this.jar.keys()];
  }
}

/** 쿠키잿을 적용해 fetch + 응답 쿠키 저장 */
export async function jarFetch(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(HTTP_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  const cookie = jar.header();
  if (cookie) headers.set('Cookie', cookie);
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  jar.store(res);
  // 수동 리다이렉트 추적 (쿠키 누적 위해)
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const loc = res.headers.get('location');
    if (loc) {
      const next = new URL(loc, url).toString();
      return jarFetch(jar, next, { headers: init.headers });
    }
  }
  return res;
}

function sha1Hex(text: string): string {
  return createHash('sha1').update(text, 'utf-8').digest('hex');
}

/** 3단계 로그인 → 인증 쿠키가 담긴 CookieJar 반환 */
export async function login(): Promise<CookieJar> {
  if (!HANDSOS_PW) throw new Error('HANDSOS_PW 환경변수가 없습니다.');

  const jar = new CookieJar();
  const today = new Date().toISOString().slice(0, 10);

  // Step 0: 로그인 페이지 (초기 ASP 세션 쿠키)
  const r0 = await jarFetch(jar, URLS.LOGIN_PAGE);
  if (!r0.ok) throw new Error(`login.asp 실패: HTTP ${r0.status}`);

  // Step 1: setCookieReset (form submit 전 AJAX)
  const r1 = await jarFetch(jar, URLS.COOKIE_RESET);
  if (!r1.ok) throw new Error(`setCookieReset.asp 실패: HTTP ${r1.status}`);

  // Step 2: loginHide POST (form-urlencoded UTF-8)
  const body = new URLSearchParams({
    companyID: COMPANY_ID,
    userID: USER_ID,
    userPWD: HANDSOS_PW,
    userPWD_Sha: sha1Hex(HANDSOS_PW),
    userPWD_mode: '1',
    strOS: 'Windows 10 or Windows 11',
    strBrowser: 'Chrome',
    serverDate: today,
    FCMToken: '',
    isCall: '',
    chkSaveCompanyID: 'Y',
    chkSaveUserID: 'Y',
    chkLoginIng: '',
  });

  const r2 = await jarFetch(jar, URLS.LOGIN_HIDE, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: URLS.LOGIN_PAGE,
      Origin: 'https://www.handsos.com',
    },
  });
  if (!r2.ok) throw new Error(`loginHide.asp 실패: HTTP ${r2.status}`);

  const names = jar.names();
  const hasAuth = ['TokenHeader', 'ckCompanyInfo', 'ckUserInfo'].some((n) => names.includes(n));
  if (!hasAuth) {
    throw new Error(`로그인 실패 — 인증 쿠키 없음 (받은 쿠키: ${names.join(', ') || '없음'})`);
  }
  return jar;
}
