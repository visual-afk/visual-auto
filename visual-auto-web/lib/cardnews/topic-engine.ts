/**
 * 카드뉴스 주제 편성 엔진 (모발 뉴스데스크) — AI 없는 순수 결정론 로테이션.
 * 같은 은행 + 같은 앵커 날짜면 언제 어디서 돌려도 같은 편성이 나온다 (append-only 시드의 전제).
 * 은행 스키마·규칙: docs/cardnews/07-topic-engine-trifield.md (저장소 루트)
 * ⚠️ 요일·월 계산은 반드시 UTC 기준(getUTCDay/getUTCMonth) — 서버 TZ(Vercel=UTC)와 무관하게
 *    'YYYY-MM-DD' 문자열 자체의 달력 요일을 쓴다 (CalendarGrid.buildCells 와 동일 기법).
 */

import trifieldBank from './topic-banks/trifield.json';

export interface TopicBankEntry {
  id: string;
  sec: string;
  mat: string;
  fact: string;
  myth?: boolean;
  verify?: boolean;
  months?: number[];
  hint?: string;
}

export interface TopicBank {
  sections: { id: string; name: string; desk: string; caution?: string }[];
  frames: { id: string; name: string; how: string }[];
  weekday_pools: Record<string, { label: string; sections: string[]; prefer_myth?: boolean; live?: boolean }>;
  entries: TopicBankEntry[];
}

export interface GeneratedTopic {
  date: string; // YYYY-MM-DD
  entry_id: string;
  section: string; // 'D06 제품·성분'
  pool_label: string;
  material: string;
  frame: string; // 'F1 수치화'
  fact_seed: string;
  hint: string | null;
  verify_needed: boolean;
  live_slot: boolean;
}

/**
 * 손으로 만든 파일 은행. 트리필드만 여기에 있고, 나머지 브랜드는 AI가 만든 은행을
 * DB(cardnews_topic_banks)에서 읽는다 — topic-bank-store.ts 의 loadTopicBank 참고.
 */
const FILE_BANKS: Record<string, TopicBank> = {
  트리필드: trifieldBank as unknown as TopicBank,
};

/** 파일 은행만 조회 (동기). DB 은행까지 포함한 조회는 loadTopicBank 를 쓴다. */
export function getFileTopicBank(brandName: string): TopicBank | null {
  return FILE_BANKS[brandName] ?? null;
}

/**
 * 전 브랜드 공용 뉴스 프레임.
 * generateTopics 가 F5(반전)를 반드시 찾으므로(myth 소재 전용) 프레임만은 브랜드마다
 * 새로 만들지 않고 이걸 재사용한다. AI가 F5를 빠뜨리면 편성이 터진다.
 */
export const SHARED_FRAMES = (trifieldBank as unknown as TopicBank).frames;

export const TOPIC_FRAMES = SHARED_FRAMES;

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Date(d.getTime() + n * 86400_000).toISOString().slice(0, 10);
}

/** 앵커 날짜부터 days일치 편성 생성. 순수 함수 — 같은 입력이면 같은 출력. */
export function generateTopics(bank: TopicBank, anchorDate: string, days: number): GeneratedTopic[] {
  const secName = new Map(bank.sections.map((s) => [s.id, s.name]));
  const frameF5 = bank.frames.find((f) => f.id === 'F5')!;
  const rotating = bank.frames.filter((f) => f.id !== 'F5'); // F5(반전)는 myth 소재 전용
  const uses = new Map<string, number>();
  const out: GeneratedTopic[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(anchorDate, i);
    const d = new Date(`${date}T00:00:00Z`);
    const month = d.getUTCMonth() + 1;
    const pool = bank.weekday_pools[String(d.getUTCDay())];
    if (!pool) continue;
    const list = bank.entries.filter((e) => pool.sections.includes(e.sec));
    // 시즌 미스매치 제외 (months가 있는데 이번 달이 아니면 뺀다)
    const candidates = list.filter((e) => !e.months || e.months.includes(month));
    if (candidates.length === 0) continue;
    // 우선순위: ① (속설 재판소면) myth ② 이번 달 시즌 소재 ③ 사용 횟수 적은 순 ④ 은행 순서
    const score = (e: TopicBankEntry) =>
      (uses.get(e.id) ?? 0) * 100 - (pool.prefer_myth && e.myth ? 15 : 0) - (e.months?.includes(month) ? 10 : 0);
    candidates.sort((a, b) => score(a) - score(b) || list.indexOf(a) - list.indexOf(b));
    const pick = candidates[0];
    const n = uses.get(pick.id) ?? 0;
    uses.set(pick.id, n + 1);
    const frame = pick.myth ? frameF5 : rotating[(n * 7 + i) % rotating.length];
    out.push({
      date,
      entry_id: pick.id,
      section: `${pick.sec} ${secName.get(pick.sec) ?? ''}`.trim(),
      pool_label: pool.label,
      material: pick.mat,
      frame: `${frame.id} ${frame.name}`,
      fact_seed: pick.fact,
      hint: pick.hint ?? null,
      verify_needed: !!pick.verify,
      live_slot: !!pool.live,
    });
  }
  return out;
}
