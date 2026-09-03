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
  letter_spacing?: number; // 자간(px). 없으면 0 — 스튜디오 슬라이더로 조절
  photo_scale?: number; // 사진 확대 배율 (1~3). 없으면 1
  photo_x?: number; // 사진 가로 이동 — 카드 폭 대비 비율. 없으면 0(가운데)
  photo_y?: number; // 사진 세로 이동 — 카드 높이 대비 비율. 없으면 0(가운데)
}

export const PHOTO_SCALE_MIN = 1;
export const PHOTO_SCALE_MAX = 3;

/** 사진 확대 배율을 안전 범위로 (렌더러·편집기 공용) */
export function clampPhotoScale(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(PHOTO_SCALE_MAX, Math.max(PHOTO_SCALE_MIN, Math.round(n * 100) / 100));
}

/**
 * 사진 이동량을 "확대해서 남는 만큼"으로 제한한다.
 * 배율 1이면 여백이 없으므로 이동 0 — 사진이 카드 밖으로 빠져 배경이 드러나는 일이 없다.
 */
export function clampPhotoOffset(v: unknown, scale: number): number {
  const n = Number(v);
  const limit = Math.max(0, (clampPhotoScale(scale) - 1) / 2);
  if (!Number.isFinite(n)) return 0;
  return Math.min(limit, Math.max(-limit, Math.round(n * 1000) / 1000));
}

/** 자간 조절 범위 (px) — 스튜디오 슬라이더와 렌더러가 공유 */
export const LETTER_SPACING_MIN = -6;
export const LETTER_SPACING_MAX = 6;

/** 저장된 자간을 안전한 범위로 자른다 (렌더 깨짐 방지) */
export function clampLetterSpacing(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(LETTER_SPACING_MAX, Math.max(LETTER_SPACING_MIN, Math.round(n * 10) / 10));
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

/**
 * 사진을 카드(또는 미리보기 박스) 안에 어떻게 놓을지 계산한다.
 * 렌더러(CardCanvas)와 편집기 미리보기(PhotoAdjuster)가 **같은 식**을 써야
 * 편집 화면에서 본 것이 그대로 PNG로 나온다.
 */
export function photoLayout(
  card: Pick<InfoCard, 'photo_scale' | 'photo_x' | 'photo_y'>,
  boxW: number,
  boxH: number,
): { w: number; h: number; left: number; top: number } {
  const scale = clampPhotoScale(card.photo_scale);
  const w = boxW * scale;
  const h = boxH * scale;
  return {
    w,
    h,
    left: (boxW - w) / 2 + clampPhotoOffset(card.photo_x, scale) * boxW,
    top: (boxH - h) / 2 + clampPhotoOffset(card.photo_y, scale) * boxH,
  };
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
 *
 * 모델이 `---` 를 빼먹고 빈 줄로만 카드를 나누는 경우가 있어(카드가 한 덩어리로 뭉쳐
 * 2·3번 카드가 통째로 유실됐다), 구분자가 없으면 **빈 줄 기준으로 한 번 더** 나눈다.
 */
export function parsePointCards(section: string | undefined): { title: string; body: string }[] {
  const raw = (section ?? '').trim();
  let blocks = raw
    .split(/^[ \t]*---+[ \t]*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 2) {
    const byBlank = raw
      .split(/\n[ \t]*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (byBlank.length > blocks.length) blocks = byBlank;
  }
  return blocks
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
