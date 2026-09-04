import { NextResponse } from 'next/server';
import { checkAllBranches } from '@/lib/rank/check';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel Cron — 매주 월요일 07:00 KST(0 22 * * 0 UTC) 전 지점 키워드 상위노출 체크.
 * CRON_SECRET 설정 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동으로 붙인다.
 * 지점 단위로 upsert 하므로 타임아웃으로 끊겨도 앞 지점 결과는 저장된다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const results = await checkAllBranches();
    const okCount = results.filter((r) => !r.error).length;
    console.log(`[cron rank-check] ${okCount}/${results.length} 지점 OK`);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('[cron rank-check]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
