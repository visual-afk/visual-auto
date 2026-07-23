import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';

type KakaoDoc = {
  x?: string; // 경도(lng)
  y?: string; // 위도(lat)
  address_name?: string;
  road_address_name?: string;
  place_name?: string;
};

async function kakaoSearch(path: string, query: string, key: string): Promise<KakaoDoc[]> {
  const url = `https://dapi.kakao.com/v2/local/search/${path}?query=${encodeURIComponent(query)}&size=1`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { documents?: KakaoDoc[] } | null;
  return data?.documents ?? [];
}

/** 지점 주소 → 좌표 자동찾기 (본사 전용). 주소검색 실패 시 상호명(키워드)으로 폴백. */
export async function POST(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: '주소 자동찾기가 아직 설정되지 않았어요. 관리자에게 문의해주세요.' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const query: string = (body.query || '').trim();
  if (!query) return NextResponse.json({ error: '주소를 입력해주세요' }, { status: 400 });

  let docs = await kakaoSearch('address.json', query, key);
  if (docs.length === 0) docs = await kakaoSearch('keyword.json', query, key);

  const doc = docs[0];
  const lat = doc?.y ? Number(doc.y) : NaN;
  const lng = doc?.x ? Number(doc.x) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '주소를 찾지 못했어요. 더 자세히 입력해 주세요.' }, { status: 404 });
  }

  const address = doc.road_address_name || doc.address_name || doc.place_name || query;
  return NextResponse.json({ lat, lng, address });
}
