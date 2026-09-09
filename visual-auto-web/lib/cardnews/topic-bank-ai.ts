/**
 * 카드뉴스 주제 은행 AI 생성기.
 *
 * 트리필드는 손으로 만든 은행(topic-banks/trifield.json)을 쓴다. 나머지 브랜드는
 * knowledge/cardnews/concept-{브랜드}.md 를 근거로 여기서 은행을 만들어 DB에 저장하고,
 * 그 다음부터는 트리필드와 **완전히 같은** 결정론 엔진(generateTopics)이 편성을 돌린다.
 * → "AI가 매일 주제를 짓는" 방식이 아니라 "AI가 은행을 한 번 짓고 편성은 결정론"이다.
 *   같은 은행 + 같은 앵커면 항상 같은 편성이 나온다는 append-only 시드의 전제를 지키려면
 *   편성 자체가 결정론이어야 한다 (topic-seed.ts 주석 참고).
 *
 * 엔트리는 면(section) 단위로 나눠 받는다. 150개를 한 번에 받으면 출력 토큰에서 잘려
 * JSON이 깨지기 때문. 면 하나가 실패해도 나머지로 은행을 만든다.
 */

import { callAI } from '@/lib/generation/ai-client';
import { loadFileSafeFor } from '@/lib/generation/ai-client';
import { SHARED_FRAMES, type TopicBank, type TopicBankEntry } from './topic-engine';

/** 면 하나에서 뽑을 소재 수 — 요일 로테이션이 반복되지 않을 만큼만 */
const ENTRIES_PER_SECTION = 12;
/** 은행으로 인정할 최소 소재 수. 이보다 적으면 편성이 금세 반복된다. */
const MIN_ENTRIES = 40;
/**
 * myth 소재 비율 상한. 엔진은 myth 소재에 **항상** F5(반전) 프레임을 주므로
 * (topic-engine.generateTopics) myth가 많으면 카드가 죄다 "통념 뒤집기"가 된다.
 * 손으로 만든 트리필드 은행이 154개 중 25개(약 16%)라 그 언저리를 상한으로 둔다.
 */
const MAX_MYTH_RATIO = 0.25;

export interface GeneratedBank {
  bank: TopicBank;
  model: string;
  warnings: string[];
}

export interface PlanSection {
  id: string;
  name: string;
  desk: string;
  caution?: string;
}

export interface PlanPool {
  day: number; // 0=일요일
  label: string;
  sections: string[];
  prefer_myth?: boolean;
  live?: boolean;
}

/** 모델이 코드펜스로 감싸 주는 경우가 잦아 벗겨낸 뒤 파싱한다. */
function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

/** 1단계: 면 구성과 요일 지면을 짠다 (짧은 호출) */
async function planSectionsAndPools(
  brandName: string,
  concept: string,
): Promise<{ sections: PlanSection[]; pools: PlanPool[]; model: string }> {
  const system = [
    `너는 "${brandName}" 인스타 카드뉴스의 편집국장이다. 매일 한 편씩 1년 내내 돌릴 수 있는 **주제 은행의 뼈대**를 짠다.`,
    '',
    '만들 것:',
    `1) sections — 이 브랜드가 다룰 주제 영역 10~14개. id는 "D01"부터 순서대로. name은 6자 내외, desk는 그 면의 한 줄 성격.`,
    '   그 면에서 조심할 게 있으면 caution에 한 줄 (예: 효능 단정 금지).',
    '2) pools — 요일 지면 7개(day 0=일요일 ~ 6=토요일). 각 요일에 어떤 면을 올릴지 sections에 id 배열로.',
    '   요일마다 성격이 뚜렷해야 한다(label은 "OO의 날" 같은 지면 이름).',
    '   통념 뒤집기를 주로 다루는 요일 하나에는 prefer_myth: true,',
    '   신제품·트렌드로 교체 가능한 요일 하나에는 live: true 를 넣는다.',
    '',
    '규칙:',
    '- 반드시 아래 브랜드 컨셉 안에서만 짠다. 컨셉에 없는 영역을 지어내지 않는다.',
    '- 모든 요일 0~6이 빠짐없이 있어야 한다. pools의 sections는 sections의 id만 쓴다.',
    '- 한국어로 쓴다.',
    '',
    '--- 브랜드 카드뉴스 컨셉 (이 안에서만) ---',
    concept || '(컨셉 파일 없음 — 브랜드명만 보고 보수적으로 짠다)',
  ].join('\n');

  const res = await callAI({
    system,
    userMessage:
      'JSON 하나만 출력해라. 형식: {"sections":[{"id":"D01","name":"","desk":"","caution":""}],"pools":[{"day":0,"label":"","sections":["D01"],"prefer_myth":false,"live":false}]}',
    json: true,
    temperature: 0.6,
    maxTokens: 3000,
  });

  const parsed = parseJsonLoose<{ sections: PlanSection[]; pools: PlanPool[] }>(res.text);
  const sections = (parsed.sections ?? []).filter((s) => s?.id && s?.name);
  const pools = (parsed.pools ?? []).filter((p) => Number.isInteger(p?.day) && Array.isArray(p?.sections));
  if (sections.length < 4) throw new Error(`${brandName}: 면 구성을 못 받았어요 (${sections.length}개)`);
  return { sections, pools, model: 'gemini' };
}

/** 2단계: 면 하나의 소재를 뽑는다 */
async function draftEntriesFor(
  brandName: string,
  concept: string,
  section: PlanSection,
): Promise<Omit<TopicBankEntry, 'id' | 'sec'>[]> {
  const system = [
    `너는 "${brandName}" 카드뉴스 편집국의 "${section.name}" 면 담당이다.`,
    `이 면의 성격: ${section.desk}`,
    section.caution ? `이 면에서 조심할 것: ${section.caution}` : '',
    '',
    `이 면에서 카드뉴스 한 편이 될 소재 ${ENTRIES_PER_SECTION}개를 뽑아라. 각 소재는:`,
    '- mat: 카드뉴스 한 편의 소재. 브랜드 톤의 구어체 한 줄 (표지 훅의 재료).',
    '- fact: 그 소재의 근거가 되는 사실 한 줄. **소재보다 이게 더 중요하다.**',
    '  카드 본문이 이 경계 밖으로 나가지 않게 하는 울타리다.',
    '- myth: 통념을 뒤집는 소재면 true (아니면 생략). **정말 통념을 뒤집는 것만** — 많아야 2~3개.',
    '- verify: 수치·고유명사가 들어가 사람이 확인해야 하면 true (아니면 생략)',
    '- months: 특정 계절에만 맞으면 해당 월 번호 배열 (연중이면 생략)',
    '- hint: 만들 때 주의할 점이 있으면 한 줄 (없으면 생략)',
    '',
    '규칙:',
    '- **지어낸 수치·연구·출처 금지.** 확실하지 않으면 fact를 단정 대신 방향으로 쓰고 verify: true 를 넣는다.',
    '- 12개가 서로 확실히 달라야 한다. 같은 말 바꿔쓰기 금지.',
    '- 반드시 아래 브랜드 컨셉의 톤과 금지사항을 따른다.',
    '- 한국어로 쓴다.',
    '',
    '--- 브랜드 카드뉴스 컨셉 (톤·금지사항 포함) ---',
    concept || '(컨셉 파일 없음)',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await callAI({
    system,
    userMessage:
      'JSON 하나만 출력해라. 형식: {"entries":[{"mat":"","fact":"","myth":false,"verify":false,"months":[],"hint":""}]}',
    json: true,
    temperature: 0.8,
    maxTokens: 4000,
  });

  const parsed = parseJsonLoose<{ entries: Omit<TopicBankEntry, 'id' | 'sec'>[] }>(res.text);
  return (parsed.entries ?? []).filter((e) => e?.mat && e?.fact);
}

/** 빈 배열·빈 문자열 같은 "있으나 마나"한 선택 필드를 떨어낸다 (은행 JSON을 작게 유지) */
export function tidyEntry(raw: Omit<TopicBankEntry, 'id' | 'sec'>, id: string, sec: string): TopicBankEntry {
  const e: TopicBankEntry = { id, sec, mat: String(raw.mat).trim(), fact: String(raw.fact).trim() };
  if (raw.myth) e.myth = true;
  if (raw.verify) e.verify = true;
  if (Array.isArray(raw.months) && raw.months.length) {
    const months = raw.months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (months.length) e.months = months;
  }
  if (raw.hint && String(raw.hint).trim()) e.hint = String(raw.hint).trim();
  return e;
}

/**
 * 브랜드 하나의 주제 은행을 AI로 만든다.
 * 면별 호출이라 일부 면이 실패해도 나머지로 은행을 완성한다 (warnings에 남긴다).
 */
export async function generateTopicBank(brandName: string, branchId: string): Promise<GeneratedBank> {
  const concept = await loadFileSafeFor(`knowledge/cardnews/concept-${brandName}.md`, branchId);
  const warnings: string[] = [];

  const { sections, pools } = await planSectionsAndPools(brandName, concept);

  const entries: TopicBankEntry[] = [];
  for (const section of sections) {
    try {
      const drafted = await draftEntriesFor(brandName, concept, section);
      drafted.forEach((raw, i) => {
        entries.push(tidyEntry(raw, `${section.id}-${String(i + 1).padStart(2, '0')}`, section.id));
      });
      if (drafted.length === 0) warnings.push(`${section.id} ${section.name}: 소재 0개`);
    } catch (e) {
      warnings.push(`${section.id} ${section.name}: ${(e as Error).message}`);
    }
  }

  return {
    bank: assembleBank(sections, pools, entries),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    warnings,
  };
}

/**
 * AI가 뱉은 조각들을 엔진이 먹을 수 있는 은행으로 조립한다 (순수 함수 — 테스트 대상).
 * 여기서 지키는 계약:
 *  - 요일 0~6이 하나도 비지 않는다 (빈 요일 = 그날 편성 없음)
 *  - 지면(pool)은 실제로 소재가 있는 면만 가리킨다
 *  - 프레임은 공용 프레임 — F5(반전)가 반드시 있어야 generateTopics 가 안 터진다
 */
export function assembleBank(
  sections: PlanSection[],
  pools: PlanPool[],
  entries: TopicBankEntry[],
): TopicBank {
  if (entries.length < MIN_ENTRIES) {
    throw new Error(`소재가 ${entries.length}개뿐이라 은행을 만들지 못했어요 (최소 ${MIN_ENTRIES}개)`);
  }

  capMythRatio(entries);

  // 소재가 하나도 없는 면은 지면에서 빼야 그 요일이 통째로 비지 않는다
  const usable = new Set(entries.map((e) => e.sec));
  const liveSections = sections.filter((s) => usable.has(s.id));
  if (liveSections.length === 0) throw new Error('소재가 있는 면이 하나도 없어요');

  const weekday_pools: TopicBank['weekday_pools'] = {};
  for (let day = 0; day <= 6; day++) {
    const p = pools.find((x) => x.day === day);
    const secs = (p?.sections ?? []).filter((id) => usable.has(id));
    // 요일 계획이 없거나 쓸 면이 남지 않았으면 전체 면으로 채운다 — 그 요일을 비우지 않는다
    weekday_pools[String(day)] = {
      label: p?.label?.trim() || '오늘의 주제',
      sections: secs.length ? secs : liveSections.map((s) => s.id),
      ...(p?.prefer_myth ? { prefer_myth: true } : {}),
      ...(p?.live ? { live: true } : {}),
    };
  }

  return {
    sections: liveSections.map((s) => ({
      id: s.id,
      name: s.name,
      desk: s.desk ?? '',
      ...(s.caution ? { caution: s.caution } : {}),
    })),
    // 프레임은 전 브랜드 공용 — 엔진이 F5(반전)를 반드시 찾으므로 AI에게 맡기지 않는다
    frames: SHARED_FRAMES,
    weekday_pools,
    entries,
  };
}

/**
 * myth 표시가 너무 많으면 앞에서부터 상한까지만 남기고 나머지는 뗀다.
 * 엔진이 myth → F5(반전) 고정이라, 그대로 두면 편성 전체가 반전 프레임으로 쏠린다.
 * 앞에서부터 자르므로 결정론은 유지된다.
 */
function capMythRatio(entries: TopicBankEntry[]): void {
  const limit = Math.max(1, Math.floor(entries.length * MAX_MYTH_RATIO));
  let kept = 0;
  for (const e of entries) {
    if (!e.myth) continue;
    if (kept < limit) kept++;
    else delete e.myth;
  }
}
