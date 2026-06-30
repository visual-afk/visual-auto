import { fetchAllRows } from '../lib/google-sheets.js';
import { syncRowToCalendar } from '../lib/google-calendar.js';

async function main() {
  console.log('🔄 구글시트 → 캘린더 동기화 시작\n');

  const rows = await fetchAllRows();
  const withDate = rows.filter(r => r.scheduledDate && r.topic);

  console.log(`총 ${rows.length}행 중 ${withDate.length}건 동기화 대상\n`);

  // 같은 주제 첫번째 = 아임웹, 두번째 = 블로그
  const seenTopics = new Set<string>();
  let synced = 0;
  let failed = 0;

  for (const row of withDate) {
    const isSecond = seenTopics.has(row.topic);
    seenTopics.add(row.topic);
    const platform = isSecond ? '블로그' : '아임웹';

    try {
      await syncRowToCalendar(row, platform);
      synced++;
    } catch (err) {
      console.error(`❌ 실패: ${row.topic} - ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n✅ 동기화 완료: 성공 ${synced}건, 실패 ${failed}건`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
