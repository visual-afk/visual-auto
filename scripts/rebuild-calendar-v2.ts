import { getCalendar } from '../lib/google-auth.js';
import { fetchAllRows } from '../lib/google-sheets.js';
import { config } from '../lib/config.js';
import type { ContentPurpose } from '../lib/types.js';

const PURPOSE_LABELS: Record<ContentPurpose, string> = {
  '노출용': '노출',
  '유입용': '유입',
  '전환용': '전환',
};

const PURPOSE_COLORS: Record<ContentPurpose, string> = {
  '노출용': '9',   // 블루베리 (파랑)
  '유입용': '5',   // 바나나 (노랑)
  '전환용': '11',  // 토마토 (빨강)
};

const calendar = getCalendar();

// 1. 기존 이벤트 전부 삭제
console.log('기존 이벤트 삭제 중...');
const existing = await calendar.events.list({
  calendarId: config.google.calendarId,
  timeMin: '2026-04-01T00:00:00Z',
  timeMax: '2026-07-01T23:59:59Z',
  singleEvents: true,
  maxResults: 200,
});

for (const e of existing.data.items || []) {
  if (e.id) {
    await calendar.events.delete({ calendarId: config.google.calendarId, eventId: e.id });
  }
}
console.log(`${existing.data.items?.length || 0}개 삭제 완료\n`);

// 2. 시트 데이터 읽기
const rows = await fetchAllRows();
const withDate = rows.filter(r => r.scheduledDate && r.topic);

// 3. 같은 주제끼리 묶기 (순서대로 첫번째=아임웹, 두번째=블로그)
const topicPairs = new Map<string, typeof withDate>();
for (const row of withDate) {
  const key = row.topic;
  if (!topicPairs.has(key)) topicPairs.set(key, []);
  topicPairs.get(key)!.push(row);
}

// 4. 캘린더 이벤트 생성
console.log('새 캘린더 생성 중...\n');
let count = 0;

for (const [topic, pair] of topicPairs) {
  // 날짜순 정렬
  pair.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  for (let i = 0; i < pair.length; i++) {
    const row = pair[i];
    const platform = i === 0 ? '아임웹' : '블로그';
    const purpose = row.contentPurpose || '노출용';
    const purposeTag = PURPOSE_LABELS[purpose] || '노출';
    const branchTag = row.branch ? `-${row.branch}` : '';

    await calendar.events.insert({
      calendarId: config.google.calendarId,
      requestBody: {
        summary: `[${platform}${branchTag}/${purposeTag}] ${row.topic}`,
        description: [
          `플랫폼: ${platform}`,
          `키워드: ${row.keywords}`,
          `글유형: ${row.postType}`,
          `글목적: ${purpose}`,
          ...(row.branch ? [`지점: ${row.branch}`] : []),
          `상태: ${row.status}`,
          row.docUrl ? `독스: ${row.docUrl}` : '',
        ].filter(Boolean).join('\n'),
        start: { date: row.scheduledDate },
        end: { date: row.scheduledDate },
        colorId: PURPOSE_COLORS[purpose] || '9',
      },
    });

    console.log(`${row.scheduledDate}  [${platform}/${purposeTag}] ${row.topic}${branchTag}`);
    count++;
  }
}

console.log(`\n✅ 완료! ${count}건 생성`);
