/** 로그인 아이디(휴대폰/핸들) → synthetic email. 클라이언트/서버 공용 (public env만 사용) */
export function loginIdToEmail(loginId: string): string {
  const domain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || 'visual.local';
  const safe = loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${safe}@${domain}`;
}
