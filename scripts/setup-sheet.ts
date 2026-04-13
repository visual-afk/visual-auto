import { getSheets } from '../lib/google-auth.js';
import { config } from '../lib/config.js';

const HEADERS = [
  '월',        // A: month
  '주차',      // B: week
  '주제',      // C: topic
  '키워드',    // D: keywords
  '글유형',    // E: post_type
  '상태',      // F: status
  '예정일',    // G: scheduled_date
  '생성일시',  // H: generated_at
  '독스URL',   // I: doc_url
  '아임웹URL', // J: imweb_url
  '네이버URL', // K: naver_url
  '조회수',    // L: views
  '전환수',    // M: conversions
];

async function main() {
  const sheets = getSheets();

  // 1. 헤더 행 세팅
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range: '시트1!A1:M1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });
  console.log('✅ 헤더 행 세팅 완료');

  // 2. 테스트 데이터 1행 추가
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range: '시트1!A2:G2',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        '2026-04',
        '2',
        '봄철 두피케어 가이드',
        '두피케어, 봄 헤어관리, 탈모예방',
        '정보형',
        'planned',
        '2026-04-15',
      ]],
    },
  });
  console.log('✅ 테스트 데이터 추가 완료');

  console.log(`\n📊 시트: https://docs.google.com/spreadsheets/d/${config.google.sheetId}`);
}

main().catch(err => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});
