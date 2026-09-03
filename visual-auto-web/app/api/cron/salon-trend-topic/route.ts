import { NextResponse } from 'next/server';
import { seedSalonTrendTopic } from '@/lib/cardnews/salon-trend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 매주 월요일 KST 08:50 (vercel.json cron "50 23 * * 0"):
 * 구글 트렌드에서 여자 연예인을 골라 비주얼살롱 "고급스러움 연구" 카드뉴스 주제 1건 편성.
 * verify_needed=true — 예진 매니저가 인물 팩트 확인 후 "이 주제로 만들기".
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
    const result = await seedSalonTrendTopic();
    console.log('[salon-trend-topic]', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
