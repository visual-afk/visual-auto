// 카드뉴스 카드 타입 + AI 응답 파서 (클라·서버 공용 — 서버 전용 import 금지)

export type CardNewsMode = 'info' | 'image';

/** 정보형: 글을 표지 → 포인트 N → CTA 슬라이드로 재구성 */
export interface InfoCard {
  idx: number;
  kind: 'cover' | 'point' | 'cta';
  title: string;
  body: string; // 표지는 비움, 포인트는 최대 2줄, CTA는 배지 문구
  // ── 아래는 사진 표지(tokens.coverStyle === 'photo')에서만 쓰는 선택 필드 ──
  photo_path?: string; // post-photos 버킷 경로. 비면 "사진 자리" placeholder로 렌더
  bubble?: string; // 말풍선 대사 (팩트 당사자의 1인칭, 8~14자)
  photo_hint?: string; // 어떤 사진을 넣어야 하는지 AI가 적어주는 지시문
}

/** 이미지형: 사진이 슬라이드, 카드엔 로고 + 한 줄 문구만 */
export interface ImageCard {
  idx: number;
  photo_path: string; // post-photos 버킷 경로
  phrase: string; // 좌하단 한 줄 문구
  is_cta: boolean; // 마지막 카드에만 CTA 배지
}

export type CardNewsCards = InfoCard[] | ImageCard[];

export interface CardNews {
  id: string;
  post_id: string | null;
  branch_id: string;
  author_id: string;
  mode: CardNewsMode;
  card_count: number;
  cards: CardNewsCards;
  caption: string | null;
  hashtags: string[];
  status: 'draft' | 'published';
  published_url: string | null;
  ig_media_id: string | null;
  views: number | null;
  saves: number | null;
  views_updated_at: string | null;
  next_check_at: string | null;
  created_at: string;
  published_at: string | null;
}

export const MIN_CARDS = 3;
export const MAX_CARDS = 8;

export function clampCardCount(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(MAX_CARDS, Math.max(MIN_CARDS, v));
}

/**
 * AI POINT_CARDS 섹션 파서 — 카드 사이 `---` 줄 구분,
 * 각 카드 첫 줄 = 제목, 나머지(최대 2줄) = 본문.
 */
export function parsePointCards(section: string | undefined): { title: string; body: string }[] {
  return (section ?? '')
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
      return { title: lines[0] ?? '', body: lines.slice(1, 3).join('\n') };
    })
    .filter((c) => c.title);
}

/** 정보형 카드 배열 조립: 표지 1 + 포인트 (count-2) + CTA 1 */
export function buildInfoCards(
  count: number,
  hook: string,
  points: { title: string; body: string }[],
  ctaTitle: string,
  ctaBody: string,
  cover?: { bubble?: string; photo_hint?: string },
): InfoCard[] {
  const pointCount = Math.max(1, count - 2);
  const chosen = points.slice(0, pointCount);
  while (chosen.length < pointCount) chosen.push({ title: '', body: '' });
  return [
    {
      idx: 0,
      kind: 'cover',
      title: hook,
      body: '',
      ...(cover?.bubble ? { bubble: cover.bubble } : {}),
      ...(cover?.photo_hint ? { photo_hint: cover.photo_hint } : {}),
    },
    ...chosen.map((p, i) => ({ idx: i + 1, kind: 'point' as const, title: p.title, body: p.body })),
    { idx: pointCount + 1, kind: 'cta', title: ctaTitle, body: ctaBody },
  ];
}
