import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

/**
 * 진단용: 함수 리전 + Supabase 왕복 지연 (/api/health)
 * ?ai=1 을 붙이면 지금 배포가 실제로 쓰는 GEMINI 키의 끝 4자리 + 라이브 호출 결과(유료 티어인지)를 확인.
 *   예) https://앱주소/api/health?ai=1
 */
export async function GET(request: Request) {
  const admin = getAdminSupabase();
  const t0 = Date.now();
  await admin.from('branches').select('id', { count: 'exact', head: true });
  const dbMs = Date.now() - t0;

  const base = {
    ok: true,
    functionRegion: process.env.VERCEL_REGION || 'local',
    supabaseRoundTripMs: dbMs,
  };

  if (new URL(request.url).searchParams.get('ai') !== '1') {
    return NextResponse.json(base);
  }

  // ── GEMINI 키 진단 ──
  const key = process.env.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const ai: Record<string, unknown> = {
    geminiKeyPresent: !!key,
    geminiKeyTail: key ? key.slice(-4) : null, // 끝 4자리만 (전체 노출 금지)
    model,
  };
  if (key) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'say OK' }] }],
            generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      );
      const d = await r.json().catch(() => ({}));
      ai.httpStatus = r.status;
      ai.serviceTier = d?.usageMetadata?.serviceTier ?? null; // 'standard'=유료, 그 외=무료
      ai.errorStatus = d?.error?.status ?? null; // RESOURCE_EXHAUSTED 등
      ai.errorMessage = d?.error?.message ?? null;
      ai.paid = d?.usageMetadata?.serviceTier === 'standard';
    } catch (e) {
      ai.callFailed = (e as Error).message;
    }
  }
  return NextResponse.json({ ...base, ai });
}
