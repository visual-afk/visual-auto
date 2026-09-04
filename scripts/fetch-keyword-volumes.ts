import 'dotenv/config';
import { getSheets } from '../lib/google-auth.js';
import { fetchVolumes } from '../lib/naver-keyword.js';

// 지점별 키워드 시트(탭 8개)의 "월간 최소 검색량" 칸을 네이버 실측값으로 자동 채운다.
//
// 사용법:
//   npm run keywords            # 모든 탭 처리
//   npm run keywords 강남신사점  # 특정 탭만 처리
//
// 준비물(.env):
//   NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID  (네이버 검색광고 API)
//   NAVER_KEYWORD_SHEET_ID  (지점별 키워드 구글시트 ID)
//   ※ 그 시트를 서비스 계정 이메일과 '편집자'로 공유해야 함.

const SHEET_ID = process.env.NAVER_KEYWORD_SHEET_ID || process.env.GOOGLE_SHEET_ID;
const KEYWORD_HEADER = '추천 키워드';
const VOLUME_HEADER = '월간 최소 검색량';

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

async function main() {
  if (!SHEET_ID) {
    throw new Error('NAVER_KEYWORD_SHEET_ID(또는 GOOGLE_SHEET_ID) 환경변수가 필요합니다.');
  }
  const onlyTab = process.argv[2]; // 특정 탭만 처리할 때
  const sheets = getSheets();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabs = (meta.data.sheets || [])
    .map((s) => s.properties?.title || '')
    .filter(Boolean)
    .filter((t) => !onlyTab || t === onlyTab);

  console.log(`📋 대상 시트: ${SHEET_ID}`);
  console.log(`📑 처리할 탭 ${tabs.length}개: ${tabs.join(', ')}\n`);

  for (const tab of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:Z`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) {
      console.log(`[${tab}] 데이터 없음 → 건너뜀`);
      continue;
    }

    const header = rows[0];
    const kwCol = header.indexOf(KEYWORD_HEADER);
    const volCol = header.indexOf(VOLUME_HEADER);
    const compCol = header.indexOf('경쟁강도');         // 있으면 채움
    const recCol = header.indexOf('신규블로그추천');     // 있으면 채움
    if (kwCol === -1 || volCol === -1) {
      console.log(`[${tab}] '${KEYWORD_HEADER}'/'${VOLUME_HEADER}' 헤더 없음 → 건너뜀`);
      continue;
    }

    const dataRows = rows.slice(1);
    const keywords = dataRows.map((r) => (r[kwCol] || '').trim()).filter(Boolean);
    const unique = [...new Set(keywords)];

    console.log(`[${tab}] 키워드 ${unique.length}개 조회 중...`);
    const volumes = await fetchVolumes(unique);

    const updates: { range: string; values: string[][] }[] = [];
    dataRows.forEach((r, i) => {
      const kw = (r[kwCol] || '').trim();
      if (!kw) return;
      const v = volumes.get(kw);
      const sheetRow = i + 2; // 헤더가 1행
      updates.push({ range: `${tab}!${colLetter(volCol)}${sheetRow}`, values: [[v ? String(v.total) : '']] });
      if (compCol > -1) {
        updates.push({ range: `${tab}!${colLetter(compCol)}${sheetRow}`, values: [[v?.compIdx || '']] });
      }
      if (recCol > -1) {
        // 신규 블로그 추천 = 경쟁 '낮음' + 검색량 50 이상이면 ⭐
        const rec = v && v.compIdx === '낮음' && v.total >= 50 ? '⭐' : '';
        updates.push({ range: `${tab}!${colLetter(recCol)}${sheetRow}`, values: [[rec]] });
      }
    });

    if (updates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      });
    }

    const under = unique.filter((k) => (volumes.get(k)?.total || 0) < 100);
    console.log(`[${tab}] ✅ 완료 — 100 미만 ${under.length}개: ${under.join(', ') || '없음'}\n`);
  }

  console.log('🎉 전부 완료! 각 탭의 "월간 최소 검색량" 칸이 채워졌어요. 100 미만 키워드만 지우면 끝.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
