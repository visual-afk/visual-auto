import crypto from 'node:crypto';

// 네이버 검색광고 "키워드도구" API
// 발급: https://searchad.naver.com → 도구 → API 사용 관리
const BASE_URL = 'https://api.searchad.naver.com';
const URI = '/keywordstool';

export interface KeywordVolume {
  keyword: string;
  pc: number;       // 월간 PC 검색수
  mobile: number;   // 월간 모바일 검색수
  total: number;    // 합계 (이 값으로 100 이상 판단)
  compIdx: string;  // 경쟁강도: 낮음 / 중간 / 높음 (신규 블로그는 '낮음'을 노린다)
  found: boolean;   // 네이버에서 데이터를 찾았는지 (false면 검색량 거의 없음/영문 등)
}

function getCreds() {
  const apiKey = process.env.NAVER_AD_API_KEY;
  const secretKey = process.env.NAVER_AD_SECRET_KEY;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;
  if (!apiKey || !secretKey || !customerId) {
    throw new Error(
      '네이버 검색광고 API 환경변수가 없습니다. .env에 NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID를 설정하세요.',
    );
  }
  return { apiKey, secretKey, customerId };
}

function sign(timestamp: string, method: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${URI}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

// 네이버는 relKeyword를 공백 제거 + 대문자로 정규화해서 돌려준다. 매칭용.
function normalize(kw: string): string {
  return kw.replace(/\s+/g, '').toUpperCase();
}

// monthlyPcQcCnt 등이 숫자 또는 "< 10" 문자열로 올 수 있다.
function parseCount(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

async function callKeywordsTool(hintKeywords: string[]): Promise<any[]> {
  const { apiKey, secretKey, customerId } = getCreds();
  const method = 'GET';
  const timestamp = Date.now().toString();
  const signature = sign(timestamp, method, secretKey);

  const params = new URLSearchParams({
    // 네이버는 힌트 키워드에 공백이 있으면 400을 반환한다 → 공백 제거
    hintKeywords: hintKeywords.map((k) => k.replace(/\s+/g, '')).join(','),
    showDetail: '1',
  });

  const res = await fetch(`${BASE_URL}${URI}?${params.toString()}`, {
    method,
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': signature,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`네이버 API 오류 ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { keywordList?: any[] };
  return data.keywordList || [];
}

export interface RelatedKeyword {
  keyword: string;
  total: number;
  compIdx: string;
}

/**
 * 힌트 키워드로 네이버가 돌려주는 "연관 키워드" 전체를 가져온다. (저경쟁 키워드 발굴용)
 */
export async function fetchRelated(hintKeywords: string[]): Promise<RelatedKeyword[]> {
  const list = await callKeywordsTool(hintKeywords);
  return list.map((item) => {
    const pc = parseCount(item.monthlyPcQcCnt);
    const mobile = parseCount(item.monthlyMobileQcCnt);
    return { keyword: String(item.relKeyword || ''), total: pc + mobile, compIdx: String(item.compIdx || '') };
  });
}

/**
 * 키워드 목록의 월간 검색량을 조회한다. (키워드당 PC+모바일 합계)
 * 네이버 제한: hintKeywords는 호출당 최대 5개 → 5개씩 묶어서 보낸다.
 */
export async function fetchVolumes(keywords: string[]): Promise<Map<string, KeywordVolume>> {
  const result = new Map<string, KeywordVolume>();

  for (let i = 0; i < keywords.length; i += 5) {
    const batch = keywords.slice(i, i + 5);
    const hints = batch.map((k) => k.replace(/\s+/g, '')); // 힌트는 공백 없이

    let list: any[] = [];
    try {
      list = await callKeywordsTool(hints);
    } catch (e) {
      console.error(`  ⚠️ 조회 실패: ${batch.join(', ')} → ${(e as Error).message}`);
    }

    const byKey = new Map<string, any>();
    for (const item of list) byKey.set(normalize(item.relKeyword), item);

    for (const kw of batch) {
      const item = byKey.get(normalize(kw));
      if (item) {
        const pc = parseCount(item.monthlyPcQcCnt);
        const mobile = parseCount(item.monthlyMobileQcCnt);
        result.set(kw, { keyword: kw, pc, mobile, total: pc + mobile, compIdx: String(item.compIdx || ''), found: true });
      } else {
        result.set(kw, { keyword: kw, pc: 0, mobile: 0, total: 0, compIdx: '', found: false });
      }
    }

    await new Promise((r) => setTimeout(r, 300)); // 호출 제한 회피
  }

  return result;
}
