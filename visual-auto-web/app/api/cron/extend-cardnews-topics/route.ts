import { NextResponse } from 'next/server';
import { extendAllBrands } from '@/lib/cardnews/topic-seed';
import { autoDraftUpcoming } from '@/lib/cardnews/draft-topic';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 매일 KST 08:50 (vercel.json cron "50 23 * * *"):
 *   1) 주제 은행이 있는 브랜드의 카드뉴스 주제 편성을 90일 앞까지 append-only 시드 + 구글캘린더 내보내기
 *   2) 앞으로 7일 안의 주제 중 초안 없는 것에 카드뉴스 초안 자동 생성 (헤드라인·카드·캡션 — 회당 최대 5개)
 * 사람은 수치 검증(팩트 확정)과 발행만 하면 된다.
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
    const draft = await autoDraftUpcoming(7, 5);
    console.log(
      `[extend-cardnews-topics] 시드 ${result.inserted}건, gcal ${result.exported}건, 초안 ${draft.drafted}건(실패 ${draft.failed})`,
      result.perBrand,
    );
    return NextResponse.json({ ok: true, ...result, ...draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
