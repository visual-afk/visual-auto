import 'dotenv/config';
import { fetchRelated } from '../lib/naver-keyword.js';

// 지점별 "경쟁 낮음" 키워드 발굴기 (신규 블로그용).
// 네이버가 돌려주는 연관 키워드 수백 개 중 compIdx='낮음' + 검색량 기준 이상만 추려준다.
//
//   npm run keywords:low            # 전 지점
//   npm run keywords:low 성수점      # 특정 지점
//   npm run keywords:low 성수점 50   # 검색량 하한 50으로 (기본 100)

const HINTS: Record<string, string[]> = {
  강남신사점: ['신사 미용실', '가로수길 미용실', '신사역 미용실', '레이어드컷'],
  마곡나루점: ['마곡 미용실', '마곡나루역 미용실', '발산역 미용실', '셋팅펌'],
  부천신중동점: ['신중동 미용실', '부천 미용실', '복구매직', 'C컬펌'],
  사가정점: ['사가정 미용실', '면목동 미용실', '새치염색', '남자 커트'],
  사가정2호점: ['사가정역 미용실', '중랑구 미용실', '레이어드컷', '볼륨매직'],
  서면전포점: ['서면 미용실', '전포동 미용실', '복구매직', '볼륨매직'],
  성수점: ['성수 미용실', '성수동 미용실', '탈색', '디자인 염색'],
  서초방배점: ['방배 미용실', '방배역 미용실', '내방역 미용실', '셋팅펌'],
};

// 미용/헤어 관련 키워드만 남기기 위한 토큰 (연관 키워드가 엉뚱한 데로 새는 것 방지)
const BEAUTY = ['미용실', '헤어', '머리', '펌', '염색', '컷', '커트', '매직', '탈색', '두피', '스파', '클리닉', '셋팅', '볼륨', '단발', '브릿지', '다운', '복구', '곱슬', '새치', '뿌리', '컬', '스타일', '드라이', '앞머리', '레이어드', '허쉬', '보브', '탈모', '결마지', '디자이너', '살롱'];

// 지점별 "우리 동네 근처" 지역 토큰 — 저경쟁 키워드를 우리 상권으로 한정
const AREAS: Record<string, string[]> = {
  강남신사점: ['신사', '압구정', '가로수길', '논현', '청담', '잠원', '반포'],
  마곡나루점: ['마곡', '발산', '등촌', '가양', '염창', '화곡', '우장산', '강서'],
  부천신중동점: ['신중동', '중동', '상동', '부천', '송내', '부개', '원미', '소사'],
  사가정점: ['사가정', '면목', '중화', '상봉', '망우', '용마산', '중랑'],
  사가정2호점: ['사가정', '면목', '중화', '상봉', '망우', '용마산', '중랑'],
  서면전포점: ['서면', '전포', '부전', '범전', '양정', '부산진', '가야', '개금', '범일'],
  성수점: ['성수', '뚝섬', '서울숲', '건대', '왕십리', '행당', '응봉'],
  서초방배점: ['방배', '내방', '사당', '이수', '서초', '남현', '낙성대', '대학동', '장승배기', '동작'],
};

function isBeauty(kw: string): boolean {
  return BEAUTY.some((t) => kw.includes(t));
}

function isNearby(kw: string, branch: string): boolean {
  return (AREAS[branch] || []).some((a) => kw.includes(a));
}

async function main() {
  const onlyBranch = process.argv[2];
  const minVol = Number(process.argv[3]) || 100;

  const branches = Object.keys(HINTS).filter((b) => !onlyBranch || b === onlyBranch);

  for (const branch of branches) {
    const seen = new Map<string, { total: number; compIdx: string }>();
    try {
      const related = await fetchRelated(HINTS[branch]);
      for (const r of related) {
        if (!r.keyword || !isBeauty(r.keyword)) continue;
        if (!seen.has(r.keyword)) seen.set(r.keyword, { total: r.total, compIdx: r.compIdx });
      }
    } catch (e) {
      console.error(`[${branch}] 발굴 실패: ${(e as Error).message}`);
    }

    const low = [...seen.entries()]
      .filter(([kw, v]) => v.compIdx === '낮음' && v.total >= minVol && isNearby(kw, branch))
      .sort((a, b) => b[1].total - a[1].total);

    console.log(`\n========== [${branch}] 경쟁 낮음 + 검색량 ${minVol}↑ : ${low.length}개 ==========`);
    for (const [kw, v] of low.slice(0, 40)) {
      console.log(`  ${kw.padEnd(20)} ${String(v.total).padStart(7)}  (낮음)`);
    }

    await new Promise((r) => setTimeout(r, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
