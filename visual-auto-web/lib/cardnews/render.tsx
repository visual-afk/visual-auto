import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { CardFrameTokens } from '@/lib/cardnews/frames';
import CardCanvas, { CARD_W, CARD_H } from '@/components/cardnews/CardCanvas';
import type { ImageCard, InfoCard } from '@/lib/cardnews/cards';

/**
 * 카드 1장을 1080×1350 PNG로 그리는 공용 로직.
 * 낱장 라우트(render/[n])와 전체 ZIP 라우트(download)가 같은 코드를 쓴다.
 */

// 폰트는 모듈 로드 시 1회 읽는다 (satori는 woff2 불가 → otf)
const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const semiBold = readFileSync(join(FONT_DIR, 'Pretendard-SemiBold.otf'));
const extraBold = readFileSync(join(FONT_DIR, 'Pretendard-ExtraBold.otf'));

const FONTS = [
  { name: 'Pretendard', data: semiBold, weight: 600 as const, style: 'normal' as const },
  { name: 'Pretendard', data: extraBold, weight: 800 as const, style: 'normal' as const },
];

export type CardNewsCard = InfoCard | ImageCard;

function contentTypeOf(path: string): string {
  return path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/**
 * 카드 사진을 서버에서 받아 data URI로 바꾼다.
 * satori가 외부 URL을 fetch 하다 실패하는 일을 없애기 위함.
 * 같은 사진을 여러 카드가 쓰면 cache로 재사용한다(ZIP 렌더에서 중복 다운로드 방지).
 */
export async function photoDataUri(
  card: CardNewsCard,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  const photoPath = card.photo_path ?? '';
  if (!photoPath) return null;
  if (cache?.has(photoPath)) return cache.get(photoPath) ?? null;

  const admin = getAdminSupabase();
  const { data: blob } = await admin.storage.from('post-photos').download(photoPath);
  let src: string | null = null;
  if (blob) {
    const buf = Buffer.from(await blob.arrayBuffer());
    src = `data:${contentTypeOf(photoPath)};base64,${buf.toString('base64')}`;
  }
  cache?.set(photoPath, src);
  return src;
}

/** 미리보기(CardCanvas DOM)와 같은 JSX를 satori로 그려 PNG 응답을 만든다. */
export function renderCard(opts: {
  mode: 'info' | 'image';
  card: CardNewsCard;
  tokens: CardFrameTokens;
  branchName: string;
  photoSrc: string | null;
  pageIndex: number;
  pageCount: number;
}): ImageResponse {
  return new ImageResponse(
    (
      <CardCanvas
        mode={opts.mode}
        card={opts.card}
        tokens={opts.tokens}
        branchName={opts.branchName}
        photoSrc={opts.photoSrc}
        pageIndex={opts.pageIndex}
        pageCount={opts.pageCount}
      />
    ),
    {
      width: CARD_W,
      height: CARD_H,
      fonts: FONTS,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

/** 카드 1장을 PNG 바이트로 (ZIP에 담을 때 사용) */
export async function renderCardBuffer(opts: Parameters<typeof renderCard>[0]): Promise<Buffer> {
  const res = renderCard(opts);
  return Buffer.from(await res.arrayBuffer());
}
