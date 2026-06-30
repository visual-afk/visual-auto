/**
 * HandSOS 크롤러 설정 — python/config.py 이식.
 * 지점 매핑·엔드포인트·시술 카테고리 규칙.
 */

/** PkCompany → 크롤러 표시명 (handsos_label) */
export const HANDSOS_BRANCHES: Record<string, string> = {
  '12549314': '사가정 1호점',
  '12549305': '사가정 2호점',
  '12549311': '마곡나루점',
  '12549306': '성수점',
  '12554562': '강남신사점',
};

export const COMPANY_ID = process.env.HANDSOS_COMPANY_ID || 'h66990005';
export const USER_ID = process.env.HANDSOS_USER_ID || 'visual0422';
export const HANDSOS_PW = process.env.HANDSOS_PW || '';

export const URLS = {
  LOGIN_PAGE: 'https://www.handsos.com/login/login.asp',
  LOGIN_HIDE: 'https://www.handsos.com/login/loginHide.asp',
  COOKIE_RESET: 'https://www.handsos.com/Login/setCookieReset.asp?a=1',
  REPORT_STAFF_SALE: 'https://www1.handsos.com/work/detail/report/report_staffSale_Comp.asp',
};

/** 시술 카테고리 (metrics_daily 컬럼키 순서) */
export const CATEGORIES = ['cut', 'perm', 'recovery', 'clinic', 'dye', 'etc'] as const;
export type Category = (typeof CATEGORIES)[number];

/** 시술명 키워드 → 카테고리 규칙 (우선순위 순). '제외'는 버림. */
export const CATEGORY_RULES: { cat: Category | 'exclude'; keywords: string[] }[] = [
  { cat: 'exclude', keywords: ['예약금', '배송비', '선불권', '기타사항', '점판'] },
  { cat: 'recovery', keywords: ['복구라인', '복구매직'] },
  { cat: 'clinic', keywords: ['크리닉', '클리닉', '영양'] },
  { cat: 'dye', keywords: ['염색', '탈색', '블랙빼기'] },
  { cat: 'cut', keywords: ['컷', '커트'] },
  { cat: 'perm', keywords: ['펌'] },
];
export const CATEGORY_FALLBACK: Category = 'etc';

/** 디자이너 select 필터 */
export const SYSTEM_STAFF_VALUES = new Set(['0', '1', '2']);
export const SYSTEM_STAFF_NAMES = new Set(['매장용', '매장회원권', '매장매출(회원권)', '접객수', '건수']);
export const PROMO_KEYWORDS = ['첫방문', '프로모션', '이달의', '퍼스널', '심야예약'];

export const HTTP_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/** 시술명을 카테고리로 분류 (python categorize 규칙) */
export function categorize(name: string): Category | null {
  for (const { cat, keywords } of CATEGORY_RULES) {
    if (keywords.some((kw) => name.includes(kw))) {
      return cat === 'exclude' ? null : cat;
    }
  }
  return CATEGORY_FALLBACK;
}
