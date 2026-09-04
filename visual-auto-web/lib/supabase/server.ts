import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/** 서버 컴포넌트 / 라우트 핸들러용 (쿠키 기반 세션) */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 set 호출 시 무시 (미들웨어가 갱신 담당)
          }
        },
      },
    },
  );
}
