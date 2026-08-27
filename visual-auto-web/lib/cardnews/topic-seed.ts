/**
 * 카드뉴스 주제 편성 시드 — append-only.
 * 앵커(DB의 최초 편성일, 없으면 오늘)부터 결정론 재생성해서 "오늘 이후 + 아직 없는 날짜"만 넣는다.
 * 기존 행은 절대 갱신·삭제하지 않는다 — 사용자 수정이 항상 이긴다.
 * (미래 날짜를 지우면 다음 크론 때 재시드됨. 비우려면 status='skipped' 사용 — UI에 안내됨.)
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
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

  // 앵커 = 이 브랜드의 최초 편성일 (결정론 시퀀스의 기준점). 비어 있으면 오늘부터 시작.
  const { data: first } = await admin
    .from('cardnews_topics')
    .select('topic_date')
    .eq('branch_id', branchId)
    .order('topic_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  const anchor = (first?.topic_date as string | undefined) ?? today;

  const totalDays = Math.max(0, daysBetween(anchor, today)) + horizonDays;
  const generated = generateTopics(bank, anchor, totalDays);

  const { data: existing } = await admin
    .from('cardnews_topics')
    .select('topic_date')
    .eq('branch_id', branchId)
    .gte('topic_date', today);
  const have = new Set(((existing ?? []) as { topic_date: string }[]).map((r) => r.topic_date));

  const rows = generated
    .filter((g) => g.date >= today && !have.has(g.date))
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

  // 동시 실행 대비: unique(branch_id, topic_date) 충돌은 조용히 무시 (기존 행 보존)
  const { data: inserted, error } = await admin
    .from('cardnews_topics')
    .upsert(rows, { onConflict: 'branch_id,topic_date', ignoreDuplicates: true })
    .select(SELECT);
  if (error) throw new Error(`주제 시드 실패(${brandName}): ${error.message}`);
  return (inserted ?? []) as SeededTopicRow[];
}
