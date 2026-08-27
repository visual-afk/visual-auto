/**
 * 카드뉴스 주제 편성 시드 — append-only.
 * 결정론 앵커(이 브랜드의 최초 편성일, 없으면 오늘)부터 재생성해서
 * **마지막 편성일 이후의 날짜만** 추가한다. 기존 행은 절대 갱신·삭제하지 않는다.
 * → 사용자가 지운 날짜는 빈 채로 유지된다 (삭제가 영구적). 전체 삭제 후 재편성하면
 *   오늘이 새 앵커가 되어 현재 은행 기준으로 처음부터 다시 짜진다.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { upsertTopicEvent, type GcalTopicItem } from '@/lib/gcal';
import { generateTopics, getTopicBank } from './topic-engine';

export interface SeededTopicRow {
  id: string;
  branch_id: string;
  topic_date: string;
  material: string;
  frame: string;
  section: string;
  status: string;
  memo: string | null;
  fact_seed: string | null;
  headline_draft: string | null;
  bubble: string | null;
  verify_needed: boolean;
  fact_confirmed: boolean;
  gcal_event_id: string | null;
}

const SELECT =
  'id, branch_id, topic_date, material, frame, section, status, memo, fact_seed, headline_draft, bubble, verify_needed, fact_confirmed, gcal_event_id';

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400_000);
}

/** 브랜드 하나를 horizonDays 앞까지 채운다. 새로 들어간 행들을 반환 (은행 없으면 []). */
export async function extendTopicSchedule(
  branchId: string,
  brandName: string,
  horizonDays = 90,
): Promise<SeededTopicRow[]> {
  const bank = getTopicBank(brandName);
  if (!bank) return [];

  const admin = getAdminSupabase();
  const today = kstTodayStr();

  // 앵커 = 이 브랜드의 최초 편성일 (결정론 시퀀스의 기준점) / 마지막 편성일 이후만 추가
  const { data: bounds } = await admin
    .from('cardnews_topics')
    .select('topic_date')
    .eq('branch_id', branchId)
    .order('topic_date', { ascending: true });
  const dates = ((bounds ?? []) as { topic_date: string }[]).map((r) => r.topic_date);
  const anchor = dates[0] ?? today;
  const lastDate = dates[dates.length - 1] ?? null;

  const targetEnd = daysBetween(anchor, today) + horizonDays; // 앵커 기준 오늘+horizon 까지
  const generated = generateTopics(bank, anchor, Math.max(0, targetEnd));

  // 삭제된 중간 날짜는 되살리지 않는다 — 마지막 편성일 이후이면서 오늘 이후인 날짜만
  const rows = generated
    .filter((g) => g.date >= today && (!lastDate || g.date > lastDate))
    .map((g) => ({
      branch_id: branchId,
      topic_date: g.date,
      entry_id: g.entry_id,
      section: g.section,
      pool_label: g.pool_label,
      material: g.material,
      frame: g.frame,
      fact_seed: g.fact_seed,
      hint: g.hint,
      verify_needed: g.verify_needed,
      live_slot: g.live_slot,
    }));
  if (rows.length === 0) return [];

  // 하루 여러 주제 허용(0029에서 unique 제거) — 동시 실행 대비는 (topic_date, entry_id) 중복 필터로 막는다
  const { data: existing } = await admin
    .from('cardnews_topics')
    .select('topic_date, entry_id')
    .eq('branch_id', branchId)
    .gte('topic_date', rows[0].topic_date);
  const seen = new Set(
    ((existing ?? []) as { topic_date: string; entry_id: string | null }[]).map((r) => `${r.topic_date}|${r.entry_id}`),
  );
  const fresh = rows.filter((r) => !seen.has(`${r.topic_date}|${r.entry_id}`));
  if (fresh.length === 0) return [];

  const { data: inserted, error } = await admin.from('cardnews_topics').insert(fresh).select(SELECT);
  if (error) throw new Error(`주제 시드 실패(${brandName}): ${error.message}`);
  return (inserted ?? []) as SeededTopicRow[];
}

/**
 * 은행 있는 모든 브랜드를 시드하고 새 행을 구글캘린더로 내보낸다.
 * 크론(/api/cron/extend-cardnews-topics)과 "지금 다시 편성"(/api/cardnews-topics/reseed)이 공유.
 */
export async function extendAllBrands(horizonDays = 90): Promise<{
  inserted: number;
  exported: number;
  perBrand: Record<string, number>;
}> {
  const admin = getAdminSupabase();
  const { data: brands, error } = await admin.from('branches').select('id, name').eq('kind', 'brand');
  if (error) throw new Error(error.message);

  let inserted = 0;
  let exported = 0;
  const perBrand: Record<string, number> = {};

  for (const b of (brands ?? []) as { id: string; name: string }[]) {
    if (!getTopicBank(b.name)) continue; // 은행 없는 브랜드는 편성 대상 아님
    const rows = await extendTopicSchedule(b.id, b.name, horizonDays);
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
  return { inserted, exported, perBrand };
}
