import 'dotenv/config';
import { fetchVolumes } from '../lib/naver-keyword.js';

// 8월 시즌 + 트렌드 헤어 후보 키워드의 실제 검색량/경쟁강도 조회 (큐레이션 근거용)
const SEASONAL = [
  '여름 단발', '여름 펌', '여름 헤어스타일', '여름 헤어', '장마철 곱슬머리', '장마 머리', '습한 날 머리',
  '곱슬머리 매직', '두피 냄새', '여름 두피케어', '두피 각질', '여름 염색', '여름 커트', '여름 숏컷',
  '잔머리 정리', '앞머리 펌', '여름 웨이브펌', '여름 탈색', '땀 두피', '휴가 헤어',
];
const TREND = [
  '허쉬컷', '레이어드컷', '빌드펌', '히피펌', '뱅헤어', '시스루뱅', '처피뱅', '원랭스컷', '슬릭컷',
  '리프컷', '태슬컷', '애교펌', '하이레이어드컷', '물결펌', '바디펌', 'C컬펌', '결이펌', '새우펌',
  '구름펌', '젤리펌', '보브펌', '허그펌', '레이어드펌',
];

async function main() {
  const all = [...new Set([...SEASONAL, ...TREND])];
  const vols = await fetchVolumes(all);

  const rows = all
    .map((k) => vols.get(k))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .sort((a, b) => b.total - a.total);

  console.log('\n키워드'.padEnd(20) + '검색량'.padStart(10) + '   경쟁강도   신규추천');
  console.log('─'.repeat(50));
  for (const v of rows) {
    const star = v.compIdx === '낮음' && v.total >= 50 ? '⭐' : v.compIdx === '중간' ? '○' : '';
    console.log(v.keyword.padEnd(20) + String(v.total).padStart(8) + `     ${v.compIdx || '-'}      ${star}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
