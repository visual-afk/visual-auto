import { fetchAllRows } from '../lib/google-sheets.js';

const rows = await fetchAllRows();
console.log(`총 ${rows.length}행\n`);

for (const r of rows) {
  console.log(`--- 행 ${r.rowIndex} ---`);
  console.log(`  topic: ${r.topic}`);
  console.log(`  month: ${r.month}`);
  console.log(`  week: ${r.week}`);
  console.log(`  keywords: ${r.keywords}`);
  console.log(`  post_type: ${r.postType}`);
  console.log(`  status: ${r.status}`);
  console.log(`  scheduled_date: ${r.scheduledDate}`);
  console.log(`  doc_url: ${r.docUrl}`);
  console.log(`  imweb_url: ${r.imwebUrl}`);
  console.log(`  naver_url: ${r.naverUrl}`);
  console.log(`  funnel: ${r.funnel}`);
  console.log(`  brain_focus: ${r.brainFocus}`);
  console.log(`  target_persona: ${r.targetPersona}`);
}
