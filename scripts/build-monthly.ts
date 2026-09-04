import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { getSheets } from '../lib/google-auth.js';
import { fetchVolumes } from '../lib/naver-keyword.js';

// 월간 지점별 키워드 선정본 생성 (지점당 8개: 동네 저경쟁 + 시즌 + 트렌드).
// 검색량·경쟁강도를 실측으로 채워 시트의 '2026-08' 탭 + 로컬 CSV로 저장.
//   npm run keywords:month

const MONTH = '2026-08';
const SHEET_ID = process.env.NAVER_KEYWORD_SHEET_ID || process.env.GOOGLE_SHEET_ID;

type Pick = [kw: string, type: '지역' | '시즌' | '트렌드'];

const SELECTION: Record<string, Pick[]> = {
  강남신사점: [
    ['잔머리 정리', '시즌'], ['여름 커트', '시즌'], ['원랭스컷', '트렌드'], ['여름 헤어스타일', '시즌'],
    ['허쉬컷', '트렌드'], ['레이어드컷', '트렌드'], ['슬릭컷', '트렌드'], ['여름 단발', '시즌'],
  ],
  마곡나루점: [
    ['마곡나루역 미용실', '지역'], ['발산역 미용실', '지역'], ['잔머리 정리', '시즌'], ['여름 커트', '시즌'],
    ['레이어드컷', '트렌드'], ['앞머리 펌', '트렌드'], ['여름 단발', '시즌'], ['허쉬컷', '트렌드'],
  ],
  부천신중동점: [
    ['신중동 미용실', '지역'], ['장마철 곱슬머리', '시즌'], ['여름 커트', '시즌'], ['곱슬머리 매직', '시즌'],
    ['C컬펌', '트렌드'], ['히피펌', '트렌드'], ['여름 단발', '시즌'], ['레이어드컷', '트렌드'],
  ],
  사가정점: [
    ['중화역 미용실', '지역'], ['사가정역 미용실', '지역'], ['잔머리 정리', '시즌'], ['여름 커트', '시즌'],
    ['여름 숏컷', '시즌'], ['레이어드컷', '트렌드'], ['허쉬컷', '트렌드'], ['여름 단발', '시즌'],
  ],
  사가정2호점: [
    ['중화동 미용실', '지역'], ['면목역 미용실', '지역'], ['잔머리 정리', '시즌'], ['여름 숏컷', '시즌'],
    ['물결펌', '트렌드'], ['히피펌', '트렌드'], ['여름 펌', '시즌'], ['레이어드컷', '트렌드'],
  ],
  서면전포점: [
    ['개금 미용실', '지역'], ['잔머리 정리', '시즌'], ['장마철 곱슬머리', '시즌'], ['여름 커트', '시즌'],
    ['곱슬머리 매직', '시즌'], ['레이어드컷', '트렌드'], ['허쉬컷', '트렌드'], ['여름 단발', '시즌'],
  ],
  성수점: [
    ['뚝섬역 미용실', '지역'], ['여름 염색', '시즌'], ['잔머리 정리', '시즌'], ['젤리펌', '트렌드'],
    ['물결펌', '트렌드'], ['시스루뱅', '트렌드'], ['여름 숏컷', '시즌'], ['허쉬컷', '트렌드'],
  ],
  서초방배점: [
    ['낙성대 미용실', '지역'], ['대학동 미용실', '지역'], ['잔머리 정리', '시즌'], ['여름 커트', '시즌'],
    ['레이어드컷', '트렌드'], ['허쉬컷', '트렌드'], ['여름 단발', '시즌'], ['슬릭컷', '트렌드'],
  ],
};

const HEADER = ['지점명', '키워드 분류', '추천 키워드', '월간 최소 검색량', '경쟁강도', '신규블로그추천', '메모'];

function recommend(compIdx: string, total: number): { star: string; memo: string } {
  if (compIdx === '낮음' && total >= 50) return { star: '⭐', memo: '초보 공략 추천 (저경쟁)' };
  if (compIdx === '중간' && total >= 50) return { star: '○', memo: '초보 도전 가능' };
  return { star: '', memo: '경쟁 높음 — 꾸준히 축적용' };
}

async function main() {
  if (!SHEET_ID) throw new Error('NAVER_KEYWORD_SHEET_ID 환경변수가 필요합니다.');

  const allKw = [...new Set(Object.values(SELECTION).flat().map(([kw]) => kw))];
  console.log(`실측 조회: ${allKw.length}개 키워드...`);
  const vols = await fetchVolumes(allKw);

  const rows: string[][] = [];
  for (const [branch, picks] of Object.entries(SELECTION)) {
    for (const [kw, type] of picks) {
      const v = vols.get(kw);
      const total = v?.total ?? 0;
      const comp = v?.compIdx ?? '';
      const { star, memo } = recommend(comp, total);
      rows.push([branch, type, kw, String(total), comp, star, memo]);
    }
  }

  // 1) 로컬 CSV
  mkdirSync('knowledge/seo/월별-키워드', { recursive: true });
  const csv = [HEADER, ...rows].map((r) => r.join(',')).join('\n') + '\n';
  writeFileSync(`knowledge/seo/월별-키워드/${MONTH}.csv`, csv, 'utf-8');

  // 2) 시트 탭 (없으면 생성, 있으면 비우고 다시)
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (meta.data.sheets || []).some((s) => s.properties?.title === MONTH);
  if (exists) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${MONTH}!A:Z` });
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: MONTH, index: 0 } } }] },
    });
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${MONTH}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADER, ...rows] },
  });

  // 콘솔 요약
  for (const [branch, picks] of Object.entries(SELECTION)) {
    console.log(`\n[${branch}]`);
    for (const [kw] of picks) {
      const v = vols.get(kw);
      const { star } = recommend(v?.compIdx ?? '', v?.total ?? 0);
      console.log(`  ${star.padEnd(2)} ${kw.padEnd(16)} ${String(v?.total ?? 0).padStart(7)}  ${v?.compIdx ?? '-'}`);
    }
  }
  console.log(`\n✅ ${MONTH} 탭 + CSV 생성 완료 (지점당 8개)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
