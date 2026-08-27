import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { extendTopicSchedule } from '@/lib/cardnews/topic-seed';
import { getTopicBank } from '@/lib/cardnews/topic-engine';
import { upsertTopicEvent, type GcalTopicItem } from '@/lib/gcal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HORIZON_DAYS = 90;

/**
 * 매일 KST 08:50 (vercel.json cron "50 23 * * *"): 주제 은행이 있는 브랜드의
 * 카드뉴스 주제 편성을 90일 앞까지 append-only 시드하고, 새 행을 구글캘린더로 내보낸다.
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

  const admin = getAdminSupabase();
  const { data: brands, error } = await admin.from('branches').select('id, name').eq('kind', 'brand');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let inserted = 0;
  let exported = 0;
  const perBrand: Record<string, number> = {};

  for (const b of (brands ?? []) as { id: string; name: string }[]) {
    if (!getTopicBank(b.name)) continue; // 은행 없는 브랜드는 편성 대상 아님
    const rows = await extendTopicSchedule(b.id, b.name, HORIZON_DAYS);
    inserted += rows.length;
    perBrand[b.name] = rows.length;

    // 새 행 구글캘린더 내보내기 (best-effort — 실패해도 시드는 유효)
    for (const row of rows) {
      const eventId = await upsertTopicEvent(row as GcalTopicItem, b.name);
      if (eventId) {
        exported += 1;
        await admin.from('cardnews_topics').update({ gcal_event_id: eventId }).eq('id', row.id);
      }
    }
  }

  console.log(`[extend-cardnews-topics] 시드 ${inserted}건, gcal ${exported}건`, perBrand);
  return NextResponse.json({ ok: true, inserted, exported, perBrand });
}
