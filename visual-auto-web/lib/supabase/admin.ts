import { createClient } from '@supabase/supabase-js';

/** 서비스 롤 클라이언트 (RLS 우회). 초대 수락·유저 생성 등 서버 전용 작업에만 사용. */
export function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** 로그인 아이디 → Supabase용 synthetic email (이메일 없이 아이디+비번 로그인) */
export function loginIdToEmail(loginId: string): string {
  const domain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || 'visual.local';
  const safe = loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${safe}@${domain}`;
}
