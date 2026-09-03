/**
 * 구글 트렌드 급상승 검색어 (비공식 RSS — 공식 API 없음).
 * https://trends.google.com/trending/rss?geo=KR
 * 항목마다 검색어 + 대략 트래픽 + 관련 뉴스 제목이 온다. 실패 시 빈 배열.
 */

export interface TrendItem {
  title: string;
  traffic: string; // 예: "2000+"
  newsTitles: string[];
}

const RSS_URL = 'https://trends.google.com/trending/rss?geo=KR';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function pick(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  let m;
  while ((m = re.exec(block))) out.push(decodeEntities(m[1].trim()));
  return out;
}

export async function fetchKrTrends(): Promise<TrendItem[]> {
  try {
    const res = await fetch(RSS_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: TrendItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml))) {
      const block = m[1];
      const title = pick(block, 'title')[0] ?? '';
      if (!title) continue;
      items.push({
        title,
        traffic: pick(block, 'ht:approx_traffic')[0] ?? '',
        newsTitles: pick(block, 'ht:news_item_title').slice(0, 3),
      });
    }
    return items;
  } catch {
    return [];
  }
}
