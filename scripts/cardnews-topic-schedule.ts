// 트리필드 카드뉴스 365일 자동 편성기
// 사용법:
//   npx tsx scripts/cardnews-topic-schedule.ts --from 2026-08-25 --days 365   # 편성표 생성
//   npx tsx scripts/cardnews-topic-schedule.ts --today                        # 오늘 주제 출력 (+Chat 알림)
// 결정론적: 같은 은행 + 같은 --from이면 항상 같은 편성이 나온다 (재실행 안전).
// 스펙: docs/cardnews/07-topic-engine-trifield.md

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = resolve(ROOT, 'cardnews/topics/trifield-topic-bank.json');
const OUT_JSON = resolve(ROOT, 'cardnews/topics/trifield-schedule.json');
const OUT_MD = resolve(ROOT, 'cardnews/topics/trifield-schedule.md');

interface Entry { id: string; sec: string; mat: string; fact: string; myth?: boolean; verify?: boolean; months?: number[]; hint?: string }
interface Bank {
  sections: { id: string; name: string; desk: string; caution?: string }[];
  frames: { id: string; name: string; how: string }[];
  weekday_pools: Record<string, { label: string; sections: string[]; prefer_myth?: boolean; live?: boolean }>;
  entries: Entry[];
}
interface Row {
  date: string; weekday: string; pool: string; section: string; id: string; mat: string;
  frame: string; fact: string; verify: boolean; live_slot: boolean; hint?: string;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const bank: Bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const secName = new Map(bank.sections.map((s) => [s.id, s.name]));
const ROTATING_FRAMES = bank.frames.filter((f) => f.id !== 'F5'); // F5(반전)는 myth 소재 전용

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generate(from: Date, days: number): Row[] {
  const uses = new Map<string, number>(); // entry id → 사용 횟수
  const rows: Row[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const month = d.getMonth() + 1;
    const pool = bank.weekday_pools[String(d.getDay())];
    const list = bank.entries.filter((e) => pool.sections.includes(e.sec));
    // 시즌 미스매치 제외 (months가 있는데 이번 달이 아니면 뺀다)
    const candidates = list.filter((e) => !e.months || e.months.includes(month));
    // 우선순위: ① (속설 재판소면) myth 소재 ② 이번 달 시즌 소재 ③ 사용 횟수 적은 순 ④ 은행 순서
    const score = (e: Entry) =>
      (uses.get(e.id) ?? 0) * 100 - (pool.prefer_myth && e.myth ? 15 : 0) - (e.months?.includes(month) ? 10 : 0);
    candidates.sort((a, b) => score(a) - score(b) || list.indexOf(a) - list.indexOf(b));
    const pick = candidates[0];
    const n = uses.get(pick.id) ?? 0;
    uses.set(pick.id, n + 1);
    const frame = pick.myth ? bank.frames.find((f) => f.id === 'F5')! : ROTATING_FRAMES[(n * 7 + i) % ROTATING_FRAMES.length];
    rows.push({
      date: fmt(d), weekday: WEEKDAY_KO[d.getDay()], pool: pool.label,
      section: `${pick.sec} ${secName.get(pick.sec)}`, id: pick.id, mat: pick.mat,
      frame: `${frame.id} ${frame.name}`, fact: pick.fact, verify: !!pick.verify,
      live_slot: !!pool.live, ...(pick.hint ? { hint: pick.hint } : {}),
    });
  }
  return rows;
}

function toMd(rows: Row[]): string {
  const lines = [
    '# 트리필드 365일 편성표 (자동 생성 — 수정은 은행/스크립트에서)',
    '',
    `생성 범위: ${rows[0].date} ~ ${rows[rows.length - 1].date} · 총 ${rows.length}일`,
    '',
    '| 날짜 | 요일 | 면 | 소재 | 프레임 | 팩트 시드 | 비고 |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const memo = [r.live_slot ? '라이브 교체 가능' : '', r.verify ? '⚠️팩트 확정 필요' : ''].filter(Boolean).join(' · ');
    lines.push(`| ${r.date} | ${r.weekday} | ${r.section} | ${r.mat} | ${r.frame} | ${r.fact} | ${memo} |`);
  }
  return lines.join('\n') + '\n';
}

async function today(): Promise<void> {
  const rows: Row[] = JSON.parse(readFileSync(OUT_JSON, 'utf8')).rows;
  const t = fmt(new Date());
  const r = rows.find((x) => x.date === t);
  if (!r) {
    console.error(`편성표에 ${t}이 없음 — --from/--days로 재생성 필요`);
    process.exit(1);
  }
  const msg = [
    `📰 오늘의 트리필드 (${r.date} ${r.weekday})`,
    `면: ${r.section} — ${r.pool}`,
    `소재: ${r.mat} (${r.id})`,
    `프레임: ${r.frame}`,
    `팩트 시드: ${r.fact}`,
    r.hint ? `훅 힌트: ${r.hint}` : '',
    r.verify ? '⚠️ 발행 전 팩트 확정 필수 (fact_basis 3개)' : '',
    r.live_slot ? '🔄 라이브 슬롯: 신제품·트렌드·논문·지점 데이터 소재가 있으면 교체' : '',
  ].filter(Boolean).join('\n');
  console.log(msg);
  const webhook = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (webhook) {
    const res = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg }),
    });
    console.log(res.ok ? '→ Google Chat 알림 전송됨' : `→ Chat 전송 실패 ${res.status}`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--today')) {
  await today();
} else {
  const from = new Date(args[args.indexOf('--from') + 1] ?? fmt(new Date()));
  const days = Number(args[args.indexOf('--days') + 1] ?? 365);
  const rows = generate(from, days);
  writeFileSync(OUT_JSON, JSON.stringify({ generated_from: fmt(from), days, rows }, null, 2));
  writeFileSync(OUT_MD, toMd(rows));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.section, (counts.get(r.section) ?? 0) + 1);
  console.log(`편성 완료: ${rows.length}일 → cardnews/topics/trifield-schedule.{json,md}`);
  for (const [s, c] of [...counts].sort()) console.log(`  ${s}: ${c}일`);
}
