import { NextResponse } from 'next/server';
import { crawlDate } from '@/lib/handsos/crawl';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel Cron — 매일 06:00 KST(0 21 * * * UTC) HandSOS 어제치 수집.
 * GitHub Actions 러너는 해외 IP라 HandSOS가 차단하므로, 서울(icn1) 리전의
 * 이 함수에서 크롤한다. Vercel Cron 은 GET 으로 호출하며 CRON_SECRET 설정 시
 * `Authorization: Bearer <CRON_SECRET>` 헤더를 자동으로 붙인다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // KST 기준 어제 (Vercel은 UTC로 도므로 +9h 보정 후 -1일)
  const date = new Date(Date.now() + 9 * 3600e3 - 24 * 3600e3).toISOString().slice(0, 10);

  try {
    // 전 지점 + 디자이너별. crawlDate는 지점총합을 먼저 upsert하므로
    // 타임아웃으로 중간에 끊겨도 지점 총합은 이미 저장된다.
    const result = await crawlDate(date, { sleepBranches: 500, sleepDesigners: 300 });
    const okCount = result.branches.filter((b) => b.ok).length;
    console.log(`[cron crawl-handsos] ${date} — ${okCount}/${result.branches.length} 지점 OK`);
    return NextResponse.json({ ok: true, date, branches: result.branches });
  } catch (e) {
    console.error('[cron crawl-handsos]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message, date }, { status: 502 });
  }
}
