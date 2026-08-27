// 트리필드 주제 ↔ 구글시트/캘린더 동기화
// 원칙: 편성표(trifield-schedule.json)는 "초안 공급자", 시트 탭 [트리필드주제]가 SSOT.
//       사용자가 시트에서 소재·프레임·헤드라인·말풍선·상태를 고치면 캘린더와 알림이 그걸 따른다.
// 사용법:
//   npx tsx scripts/cardnews-topic-sync.ts --seed              # 편성표 → 시트 (이미 있는 날짜는 건드리지 않음)
//   npx tsx scripts/cardnews-topic-sync.ts --calendar --days 60 # 시트 → 캘린더 (오늘부터 N일 업서트)
//   npx tsx scripts/cardnews-topic-sync.ts --today             # 오늘 주제 출력 + Google Chat 알림 (시트 기준)
// 스펙: docs/cardnews/07-topic-engine-trifield.md §7

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSheets, getCalendar } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEDULE_PATH = resolve(ROOT, 'cardnews/topics/trifield-schedule.json');
const TAB = '트리필드주제';
const HEADER = ['날짜', '요일', '면', '소재', '프레임', '팩트시드', '헤드라인초안', '말풍선', '팩트확정', '상태', '비고', 'ID'];
const TAG = 'TFTOPIC'; // 캘린더 이벤트 식별 태그
const COLOR_ID = '2'; // 세이지(초록) — 블로그(파랑/노랑/빨강)와 구분

interface TopicRow {
  date: string; weekday: string; section: string; mat: string; frame: string;
  fact: string; headline: string; bubble: string; verified: string; status: string; memo: string; id: string;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
}

async function ensureTab(): Promise<void> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.google.sheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId, range: `${TAB}!A1:L1`,
      valueInputOption: 'RAW', requestBody: { values: [HEADER] },
    });
    console.log(`시트 탭 [${TAB}] 생성`);
  }
}

async function readSheetRows(): Promise<TopicRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId, range: `${TAB}!A2:L`,
  });
  return (res.data.values ?? []).map((v: string[]) => ({
    date: v[0] ?? '', weekday: v[1] ?? '', section: v[2] ?? '', mat: v[3] ?? '', frame: v[4] ?? '',
    fact: v[5] ?? '', headline: v[6] ?? '', bubble: v[7] ?? '', verified: v[8] ?? '',
    status: v[9] ?? 'planned', memo: v[10] ?? '', id: v[11] ?? '',
  })).filter((r) => r.date);
}

async function seed(): Promise<void> {
  await ensureTab();
  const existing = new Set((await readSheetRows()).map((r) => r.date));
  const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')).rows as {
    date: string; weekday: string; section: string; id: string; mat: string;
    frame: string; fact: string; verify: boolean; live_slot: boolean; hint?: string;
  }[];
  const fresh = schedule.filter((r) => !existing.has(r.date));
  if (!fresh.length) { console.log('시드: 추가할 날짜 없음 (전부 시트에 존재)'); return; }
  const values = fresh.map((r) => [
    r.date, r.weekday, r.section, r.mat, r.frame, r.fact,
    r.hint ?? '', '', r.verify ? '필요' : '-', 'planned',
    r.live_slot ? '라이브 교체 가능' : '', r.id,
  ]);
  await getSheets().spreadsheets.values.append({
    spreadsheetId: config.google.sheetId, range: `${TAB}!A2`,
    valueInputOption: 'RAW', requestBody: { values },
  });
  console.log(`시드: ${fresh.length}행 추가 (기존 ${existing.size}행 보존)`);
}

function eventBody(r: TopicRow) {
  return {
    summary: `[트리필드] ${r.mat}`,
    description: [
      `${TAG}:${r.date}`, `면: ${r.section}`, `프레임: ${r.frame}`, `팩트시드: ${r.fact}`,
      r.headline ? `헤드라인: ${r.headline}` : '', r.bubble ? `말풍선: ${r.bubble}` : '',
      r.verified === '필요' ? '⚠️ 팩트 확정 필요' : '', `상태: ${r.status}`, r.memo,
    ].filter(Boolean).join('\n'),
    start: { date: r.date }, end: { date: r.date }, colorId: COLOR_ID,
  };
}

async function syncCalendar(days: number): Promise<void> {
  const calendar = getCalendar();
  const calendarId = process.env.CARDNEWS_CALENDAR_ID || config.google.calendarId;
  const from = kstToday();
  const to = new Date(new Date(from).getTime() + days * 86400000).toISOString().split('T')[0];
  const rows = (await readSheetRows()).filter((r) => r.date >= from && r.date < to);

  const listed = await calendar.events.list({
    calendarId, q: TAG, singleEvents: true, maxResults: 2500,
    timeMin: `${from}T00:00:00Z`, timeMax: `${to}T23:59:59Z`,
  });
  const byDate = new Map<string, { id: string; summary: string; description: string }>();
  for (const e of listed.data.items ?? []) {
    const m = e.description?.match(new RegExp(`${TAG}:(\\d{4}-\\d{2}-\\d{2})`));
    if (m && e.id) byDate.set(m[1], { id: e.id, summary: e.summary ?? '', description: e.description ?? '' });
  }

  let created = 0, updated = 0, removed = 0;
  for (const r of rows) {
    const body = eventBody(r);
    const found = byDate.get(r.date);
    if (r.status === 'skip') {
      if (found) { await calendar.events.delete({ calendarId, eventId: found.id }); removed++; }
      continue;
    }
    if (!found) {
      await calendar.events.insert({ calendarId, requestBody: body });
      created++;
    } else if (found.summary !== body.summary || found.description !== body.description) {
      await calendar.events.patch({ calendarId, eventId: found.id, requestBody: body });
      updated++;
    }
  }
  console.log(`캘린더 동기화 (${from} ~ ${to}): 생성 ${created} · 갱신 ${updated} · 삭제 ${removed} · 유지 ${rows.length - created - updated - removed}`);
}

async function today(): Promise<void> {
  const t = kstToday();
  const r = (await readSheetRows()).find((x) => x.date === t);
  if (!r) { console.error(`시트에 ${t} 행 없음 — --seed 먼저`); process.exit(1); }
  if (r.status === 'skip') { console.log(`오늘(${t})은 skip 처리됨`); return; }
  const msg = [
    `📰 오늘의 트리필드 (${r.date} ${r.weekday})`,
    `면: ${r.section} · 프레임: ${r.frame}`,
    `소재: ${r.mat}${r.id ? ` (${r.id})` : ''}`,
    `팩트 시드: ${r.fact}`,
    r.headline ? `헤드라인 초안: ${r.headline}` : '',
    r.bubble ? `말풍선: ${r.bubble}` : '',
    r.verified === '필요' ? '⚠️ 발행 전 팩트 확정 필수 (fact_basis 3개)' : '',
    r.memo ? `비고: ${r.memo}` : '',
    '✏️ 수정: 구글시트 [트리필드주제] 탭에서',
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
const days = Number(args[args.indexOf('--days') + 1] || 60);
if (args.includes('--seed')) await seed();
if (args.includes('--calendar')) await syncCalendar(days);
if (args.includes('--today')) await today();
if (!args.length) console.log('사용법: --seed | --calendar [--days N] | --today (조합 가능)');
