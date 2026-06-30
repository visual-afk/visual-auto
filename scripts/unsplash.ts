import 'dotenv/config';

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY!;

/** 한국어 주제/이미지 설명 → 영어 키워드 매핑 */
const KEYWORD_MAP: Record<string, string> = {
  // 헤어 스타일
  '단발': 'short bob hair woman',
  '레이어드컷': 'layered hair woman',
  '롱헤어': 'long hair woman',
  '미디엄': 'medium length hair',
  '커트': 'haircut salon',
  '머릿결': 'shiny hair texture',
  '윤기': 'glossy hair',
  '동안': 'youthful hair style',
  '어려보이는': 'natural hair styling',
  '볼륨': 'voluminous hair',
  '뿌리': 'hair roots volume',
  '정수리': 'crown hair volume',
  '앞머리': 'bangs hairstyle',
  '곱슬': 'curly hair',
  '부스스': 'frizzy hair',
  '손상': 'damaged hair',
  '복구': 'hair treatment',

  // 시술
  '결마지': 'hair treatment shiny',
  '매직': 'hair straightening',
  '펌': 'hair perm wave',
  '염색': 'hair color dye',
  '탈색': 'hair bleaching blonde',
  '컬러': 'hair color',
  '애쉬': 'ash brown hair',
  '브라운': 'brown hair color',
  '두피': 'scalp care',
  '두피케어': 'scalp treatment spa',
  '리프팅': 'lifted hair',
  '트리트먼트': 'hair treatment oil',
  '클리닉': 'hair clinic care',

  // 장면/컨셉
  '비포애프터': 'before after hair transformation',
  '시술': 'hair styling process',
  '상담': 'hair consultation',
  '진단': 'hair analysis',
  '매장': 'modern hair salon interior',
  '거울': 'mirror reflection hair',
  '드라이': 'hair drying',
  '샴푸': 'hair shampoo wash',
  '에센스': 'hair essence oil',
  '제품': 'hair product bottle',

  // 시즌/상황
  '여름': 'summer hair beach',
  '장마': 'humid weather hair',
  '습기': 'humid hair frizz',
  '자외선': 'sun hair protection',
  '겨울': 'winter hair care',

  // 페르소나
  '워킹맘': 'busy korean woman hair',
  '직장인': 'office woman hairstyle',
  '30대': '30s korean woman',
  '결혼식': 'wedding hairstyle',
  '남자': 'mens haircut',

  // 후기/감정
  '후기': 'happy hair customer',
  '만족': 'satisfied woman mirror',
};

/** 한국어 설명을 영어 키워드로 변환 */
function toEnglishQuery(koreanText: string): string {
  const matched: string[] = [];
  for (const [kr, en] of Object.entries(KEYWORD_MAP)) {
    if (koreanText.includes(kr)) matched.push(en);
  }
  // 매칭 없으면 기본값
  if (matched.length === 0) return 'korean woman hair lifestyle';
  // 최대 3개 키워드만 사용
  return matched.slice(0, 3).join(' ');
}

/** Unsplash에서 이미지 검색 → URL 반환 */
export async function searchUnsplash(koreanQuery: string, count = 1): Promise<string[]> {
  if (!UNSPLASH_KEY) {
    console.log('⚠️ UNSPLASH_ACCESS_KEY 없음');
    return [];
  }

  const query = toEnglishQuery(koreanQuery);

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high`,
      { headers: { 'Authorization': `Client-ID ${UNSPLASH_KEY}` } }
    );

    if (!response.ok) {
      console.log(`⚠️ Unsplash API 에러: ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const results = data.results || [];

    // 랜덤하게 count개 선택
    const shuffled = results.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((r: any) => r.urls.regular);
  } catch (err) {
    console.log(`⚠️ Unsplash 검색 실패: ${(err as Error).message?.slice(0, 60)}`);
    return [];
  }
}

/** URL에서 이미지를 Buffer로 다운로드 */
export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
