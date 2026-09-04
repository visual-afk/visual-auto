import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { fetchRelated, fetchVolumes } from '../lib/naver-keyword.js';

// 지점별 월간 키워드 엑셀 생성 (블로그앱 "키워드 조사" 업로드용).
// - 지점당 30개 = 지역 12 + 컷 8 + 펌 4 + 컬러 4 + 케어 2 (모자라면 다른 데서 채움).
// - 지역: 네이버 연관키워드로 우리 상권만 실측 발굴.
// - 트렌드/컬러/케어: 실제 미용실 시술 키워드 큐레이션 목록을 실측 → 지점마다 회전 배분.
// - 추천 주제 ON = 검색량 100~15,000 (적정), OFF = 대형(15,000 초과)/100 미만.
//   npm run keywords:branch

const MONTH = '2026-09';
const PER_BRANCH = 30;
const MIN_VOL = 100;
const BIG_VOL = 15000;
const QUOTA = { sig: 2, local: 8, cut: 8, perm: 3, color: 3, care: 2, season: 4 };

const BRANCHES = ['강남신사점', '마곡나루점', '부천신중동점', '사가정2호점', '사가정점', '서면전포점', '서초방배점', '성수점'];

// 지점별 지역 시드 (동네 연관키워드 발굴용, 호출당 최대 5개)
const REGION_SEEDS: Record<string, string[]> = {
  강남신사점: ['신사 미용실', '가로수길 미용실', '신사역 미용실', '압구정 미용실', '신사동 미용실'],
  마곡나루점: ['마곡 미용실', '마곡나루역 미용실', '발산역 미용실', '등촌 미용실', '가양 미용실'],
  부천신중동점: ['신중동 미용실', '부천 미용실', '상동 미용실', '중동 미용실', '송내 미용실'],
  사가정2호점: ['사가정역 미용실', '중화동 미용실', '면목역 미용실', '상봉 미용실', '중랑구 미용실'],
  사가정점: ['사가정 미용실', '중화역 미용실', '면목동 미용실', '망우 미용실', '용마산 미용실'],
  서면전포점: ['서면 미용실', '전포동 미용실', '개금 미용실', '부전동 미용실', '양정 미용실'],
  서초방배점: ['방배 미용실', '방배역 미용실', '낙성대 미용실', '대학동 미용실', '내방역 미용실'],
  성수점: ['성수 미용실', '성수동 미용실', '뚝섬역 미용실', '서울숲 미용실', '건대 미용실'],
};

// 지점별 "우리 동네" 지역 토큰 (지역 키워드를 우리 상권으로 한정)
const AREAS: Record<string, string[]> = {
  강남신사점: ['신사', '압구정', '가로수길', '논현', '청담', '잠원', '반포'],
  마곡나루점: ['마곡', '발산', '등촌', '가양', '염창', '화곡', '우장산', '강서'],
  부천신중동점: ['신중동', '중동', '상동', '부천', '송내', '부개', '원미', '소사'],
  사가정2호점: ['사가정', '면목', '중화', '상봉', '망우', '용마산', '중랑'],
  사가정점: ['사가정', '면목', '중화', '상봉', '망우', '용마산', '중랑'],
  서면전포점: ['서면', '전포', '부전', '범전', '양정', '부산진', '가야', '개금', '범일'],
  서초방배점: ['방배', '내방', '사당', '이수', '서초', '남현', '낙성대', '대학동', '장승배기', '동작'],
  성수점: ['성수', '뚝섬', '서울숲', '건대', '왕십리', '행당', '응봉'],
};

// ── 큐레이션: 실제 미용실 시술 키워드 (2026 최신 트렌드 + 시즌 톤다운/환절기) ──
// 검색량 미달(100 미만)/대형은 자동 처리. 신조어 트렌드명은 검색량 있으면 살아남음.
const CUT_KWS = ['레이어드컷', '허쉬컷', '보브컷', '단발머리', '숏단발', '여자숏컷', '중단발', '레이어드단발', '슬릭컷', '슬릭보브', '클라우드보브', '박스보브', '글래시보브', '크로매틱보브', '태슬컷', '늑대컷', '샤기컷', '픽시컷', '시스루뱅', '버킨뱅', '처피뱅', '커튼뱅', '거지존', '히메컷', '레이어드보브'];
const PERM_KWS = ['그라시아펌', '히피펌', 'C컬펌', 'S컬펌', '물결펌', '빌드펌', '레이어드펌', '볼륨펌', '셋팅펌', '뿌리볼륨펌', '앞머리펌', '아이롱펌', '바디펌', '다운펌', '허그펌', '젤리펌', '리프펌'];
const COLOR_KWS = ['애쉬브라운', '브라운염색', '밀크브라운', '베이지브라운', '모카브라운', '올리브브라운', '초코브라운', '새치염색', '뿌리염색', '톤다운염색', '옴브레', '발레아쥬', '가을염색', '그레이염색', '다크브라운', '흑갈색', '애쉬카키'];
const CARE_KWS = ['환절기탈모', '탈모케어', '두피클리닉', '두피스케일링', '헤드스파', '손상모클리닉', '복구매직', '볼륨매직', '모발클리닉', '두피케어'];
// 비주얼살롱 시그니처 — 검색량 낮아도 브랜드 자산이라 강제 포함(추천 ON)
const SIGNATURE_KWS = ['결마지', '결마지펌', '결마지매직', '결마지클리닉'];
// 9월 계절(환절기·초가을) 시술 키워드
const SEASON_KWS = ['가을염색', '가을단발', '가을커트', '가을헤어스타일', '가을펌', '환절기탈모', '환절기두피', '손상모복구', '여름손상모', '가을웜톤', '가을브라운', '가을단발머리'];

const isNearby = (kw: string, branch: string) => (AREAS[branch] || []).some((a) => kw.includes(a));
const comp1 = (c: string) => (c === '낮음' ? 0 : c === '중간' ? 1 : 2);
// 오프브랜드/네거티브 (미용실 시술 아님) — 지역 발굴 결과에서 걸러냄
const BLACK = ['대머리', '가발', '반영구', '문신', '타투', '왁싱', '네일', '태닝', '속눈썹', '눈썹', '붙임머리', '증모', '흉터', '이식', '앰플', '전문의', '염색약', '펌제', '샴푸', '고데기', '셀프', '메이크업', '바버', '피부', '에스테틱', '마사지', '두피문신'];
const isBlack = (kw: string) => BLACK.some((t) => kw.includes(t));
// 지역 키워드는 실제 헤어살롱 검색어 형태만 (브랜드명·엉뚱한 업종 배제)
const HAIR_OK = ['미용실', '헤어', '펌', '염색', '컷', '커트', '매직', '클리닉', '스파', '살롱', '드라이', '단발', '두피', '탈색', '붙임'];
const isHair = (kw: string) => HAIR_OK.some((t) => kw.includes(t));

type Cand = { keyword: string; total: number; compIdx: string; force?: boolean };

async function curatedCat(keywords: string[]): Promise<Cand[]> {
  const vols = await fetchVolumes(keywords);
  const out: Cand[] = [];
  for (const kw of keywords) {
    const v = vols.get(kw);
    if (!v || !v.found || v.total < MIN_VOL || v.total > BIG_VOL) continue;
    out.push({ keyword: kw, total: v.total, compIdx: v.compIdx });
  }
  out.sort((a, b) => comp1(a.compIdx) - comp1(b.compIdx) || b.total - a.total);
  return out;
}

// 시그니처: 검색량 하한 무시하고 실측값 있으면 포함(추천 강제 ON)
async function forcedCat(keywords: string[]): Promise<Cand[]> {
  const vols = await fetchVolumes(keywords);
  const out: Cand[] = [];
  for (const kw of keywords) {
    const v = vols.get(kw);
    if (!v || !v.found || v.total <= 0 || v.total > BIG_VOL) continue;
    out.push({ keyword: kw, total: v.total, compIdx: v.compIdx, force: true });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

async function main() {
  // 1) 시그니처/트렌드/컬러/케어/계절 큐레이션 실측
  console.log('시그니처/트렌드/컬러/케어/계절 실측 조회...');
  const sigList = await forcedCat(SIGNATURE_KWS);
  console.log(`  [시그니처] ${sigList.map((c) => `${c.keyword}(${c.total})`).join(', ') || '없음'}`);
  const catList = {
    cut: await curatedCat(CUT_KWS),
    perm: await curatedCat(PERM_KWS),
    color: await curatedCat(COLOR_KWS),
    care: await curatedCat(CARE_KWS),
    season: await curatedCat(SEASON_KWS),
  };
  for (const [k, list] of Object.entries(catList)) {
    console.log(`  [${k}] 적정(100~15000) ${list.length}개: ${list.map((c) => `${c.keyword}(${c.total})`).join(', ')}`);
  }

  const allRows: (string | number | boolean)[][] = [];
  const summary: string[] = [];

  for (let bi = 0; bi < BRANCHES.length; bi++) {
    const branch = BRANCHES[bi];
    console.log(`\n[${branch}] 지역 연관키워드 조회...`);

    // 2) 지역: 연관키워드 → 우리 상권만 + 적정 + 비네거티브
    let localCands: Cand[] = [];
    try {
      const related = await fetchRelated(REGION_SEEDS[branch]);
      const seen = new Map<string, Cand>();
      for (const r of related) {
        if (!r.keyword || isBlack(r.keyword) || !isHair(r.keyword) || !isNearby(r.keyword, branch)) continue;
        if (r.total < MIN_VOL || r.total > BIG_VOL) continue;
        const prev = seen.get(r.keyword);
        if (!prev || r.total > prev.total) seen.set(r.keyword, { keyword: r.keyword, total: r.total, compIdx: r.compIdx });
      }
      localCands = [...seen.values()].sort((a, b) => comp1(a.compIdx) - comp1(b.compIdx) || b.total - a.total);
    } catch (e) {
      console.error(`  ⚠️ 지역 조회 실패: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 400));

    // 3) 30개 채우기 — 지역 + 카테고리별 회전 배분(지점마다 다른 구간)
    const used = new Set<string>();
    const rows: Cand[] = [];
    const take = (list: Cand[], n: number, offset = 0) => {
      const len = list.length;
      for (let j = 0; j < len && n > 0 && rows.length < PER_BRANCH; j++) {
        const c = list[(offset + j) % len];
        if (used.has(c.keyword)) continue;
        used.add(c.keyword);
        rows.push(c);
        n--;
      }
    };

    take(sigList, QUOTA.sig); // 시그니처(결마지) 먼저
    take(localCands, QUOTA.local);
    take(catList.cut, QUOTA.cut, bi * QUOTA.cut);
    take(catList.perm, QUOTA.perm, bi * QUOTA.perm);
    take(catList.color, QUOTA.color, bi * QUOTA.color);
    take(catList.care, QUOTA.care, bi * QUOTA.care);
    take(catList.season, QUOTA.season, bi * QUOTA.season);
    // 부족분: 남은 지역 → 남은 트렌드 순
    if (rows.length < PER_BRANCH) take(localCands, PER_BRANCH);
    if (rows.length < PER_BRANCH) take([...catList.cut, ...catList.color, ...catList.perm, ...catList.season, ...catList.care], PER_BRANCH);

    const localN = rows.filter((r) => isNearby(r.keyword, branch)).length;
    summary.push(`${branch}: ${rows.length}개 (지역 ${localN} / 시그니처·트렌드·계절 ${rows.length - localN})`);
    for (const p of rows) allRows.push([branch, p.keyword, p.total, p.compIdx || '-', p.force === true || (p.total >= MIN_VOL && p.total <= BIG_VOL)]);
  }

  // 4) 엑셀(지점별 시트) + CSV 출력
  //    앱 요구사항: 지점마다 별도 시트(탭명=지점) + "추천 키워드" 컬럼.
  mkdirSync('knowledge/seo/월별-키워드', { recursive: true });
  const SHEET_HEADER = ['추천 키워드', '월 검색량', '경쟁도', '추천 주제'];
  const wb = XLSX.utils.book_new();
  for (const branch of BRANCHES) {
    const rows = allRows.filter((r) => r[0] === branch).map((r) => [r[1], r[2], r[3], r[4]]);
    const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADER, ...rows]);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, branch); // 시트명 = 지점명
  }
  const xlsxPath = `knowledge/seo/월별-키워드/${MONTH}-지점별.xlsx`;
  XLSX.writeFile(wb, xlsxPath);

  const CSV_HEADER = ['지점', '추천 키워드', '월 검색량', '경쟁도', '추천 주제'];
  const csv = [CSV_HEADER, ...allRows].map((r) => r.map((c) => (c === true ? 'TRUE' : c === false ? 'FALSE' : c)).join(',')).join('\n') + '\n';
  writeFileSync(`knowledge/seo/월별-키워드/${MONTH}-지점별.csv`, '﻿' + csv, 'utf-8');

  console.log(`\n===== 선정 요약 =====`);
  summary.forEach((s) => console.log('  ' + s));
  console.log(`\n✅ 엑셀 생성: ${xlsxPath}  (총 ${allRows.length}행)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
