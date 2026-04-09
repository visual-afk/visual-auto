import { fetchAllRows } from '../lib/google-sheets.js';

async function main() {
  console.log('📅 이번주 블로그 일정 확인\n');

  const rows = await fetchAllRows();
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay()); // 일요일
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // 토요일

  const todayStr = today.toISOString().split('T')[0];
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // 이번주 행
  const thisWeek = rows.filter(r => {
    return r.scheduledDate >= weekStartStr && r.scheduledDate <= weekEndStr;
  });

  if (thisWeek.length === 0) {
    console.log('이번주 예정된 블로그 글이 없습니다.');
    return;
  }

  // 상태별 그룹
  for (const row of thisWeek) {
    const isToday = row.scheduledDate === todayStr;
    const marker = isToday ? '👉 오늘' : '  ';
    const statusEmoji = {
      planned: '⏳',
      generating: '🤖',
      draft_ready: '📝',
      reviewing: '👀',
      published: '✅',
      tracking: '📊',
    }[row.status] || '❓';

    console.log(`${marker} ${row.scheduledDate} | ${statusEmoji} ${row.status.padEnd(12)} | ${row.topic}`);
    if (row.keywords) console.log(`       키워드: ${row.keywords}`);
    if (row.docUrl) console.log(`       독스: ${row.docUrl}`);
    console.log();
  }

  // 요약
  const planned = thisWeek.filter(r => r.status === 'planned').length;
  const done = thisWeek.filter(r => r.status === 'published' || r.status === 'tracking').length;
  console.log(`---\n이번주: 총 ${thisWeek.length}건 | 예정 ${planned}건 | 완료 ${done}건`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
