import { crawlDate, crawlRange } from '../lib/handsos/crawl';
// env는 실행 환경(GitHub Actions env / Vercel)에서 주입한다 (dotenv 미사용).

/**
 * HandSOS 일별 성과 크롤 → Supabase metrics_daily.
 *
 * 실행:
 *   tsx scripts/crawl-handsos.ts                       # 어제
 *   tsx scripts/crawl-handsos.ts --date 2026-06-29     # 특정일
 *   tsx scripts/crawl-handsos.ts --backfill 2026-06-01 2026-06-29
 *
 * 필요 env: HANDSOS_PW, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--backfill');
  if (i !== -1) {
    const start = argv[i + 1];
    const end = argv[i + 2];
    if (!start || !end) throw new Error('--backfill START END (YYYY-MM-DD) 형식으로');
    console.log(`📊 백필 ${start} ~ ${end}`);
    const results = await crawlRange(start, end);
    for (const r of results) console.log(`  ${r.date}:`, r.branches.map((b) => `${b.branch}(${b.ok ? b.designers + '명' : b.reason})`).join(', '));
    return;
  }

  const dateIdx = argv.indexOf('--date');
  const date = dateIdx !== -1 ? argv[dateIdx + 1] : yesterday();
  console.log(`📊 ${date} 크롤 시작`);
  const result = await crawlDate(date, { sleepBranches: 3000, sleepDesigners: 1000 });
  for (const b of result.branches) {
    console.log(`  ${b.branch}: ${b.ok ? `OK (디자이너 ${b.designers}명)` : `실패 — ${b.reason}`}`);
  }
  console.log('✅ 완료');
}

main().catch((e) => {
  console.error('❌', (e as Error).message);
  process.exit(1);
});
