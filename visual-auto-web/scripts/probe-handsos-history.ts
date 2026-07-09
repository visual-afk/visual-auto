/**
 * (임시 조사용) HandSOS 데이터 보존 기간 + 신규 지점 데이터 유무 probe.
 * 실행: HANDSOS_PW=... tsx scripts/probe-handsos-history.ts
 */
import { login } from '../lib/handsos/auth';
import { fetchStaffSale } from '../lib/handsos/fetch';
import { parseStaffSale } from '../lib/handsos/parse';

const PROBES: { pk: string; label: string; dates: string[] }[] = [
  { pk: '12549306', label: '성수점(기존)', dates: ['2025-01-15', '2025-07-15', '2026-01-15'] },
  { pk: '12558403', label: '서면전포점(부산)', dates: ['2025-07-15', '2026-01-15', '2026-04-15', '2026-07-08'] },
  { pk: '12558477', label: '서초방배점', dates: ['2025-07-15', '2026-01-15', '2026-04-15', '2026-07-08'] },
];

async function main() {
  const jar = await login();
  for (const { pk, label, dates } of PROBES) {
    for (const date of dates) {
      try {
        const html = await fetchStaffSale(jar, pk, date, '');
        const row = parseStaffSale(html);
        const total = (row.new_sales || 0) + (row.repeat_sales || 0);
        console.log(`${label} ${date}: 매출 ${total.toLocaleString()}원, 접객 ${row.guest_count}명, 컷 ${row.cut}`);
      } catch (e) {
        console.log(`${label} ${date}: ❌ ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

main().catch((e) => {
  console.error('❌', (e as Error).message);
  process.exit(1);
});
