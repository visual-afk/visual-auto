import { NextResponse } from 'next/server';
import { extendAllBrands } from '@/lib/cardnews/topic-seed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 매일 KST 08:50 (vercel.json cron "50 23 * * *"): 주제 은행이 있는 브랜드의
 * 카드뉴스 주제 편성을 90일 앞까지 append-only 시드 + 새 행 구글캘린더 내보내기.
 * 최초 시드도 이 라우트 — 배포 후 CRON_SECRET 으로 1회 호출하면 된다.
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
    const result = await extendAllBrands();
    console.log(`[extend-cardnews-topics] 시드 ${result.inserted}건, gcal ${result.exported}건`, result.perBrand);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
