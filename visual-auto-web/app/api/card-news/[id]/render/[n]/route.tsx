import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFrameFor } from '@/lib/cardnews/frames';
import CardCanvas, { CARD_W, CARD_H } from '@/components/cardnews/CardCanvas';
import type { ImageCard, InfoCard } from '@/lib/cardnews/cards';

export const runtime = 'nodejs';

// 폰트는 모듈 로드 시 1회 읽는다 (satori는 woff2 불가 → otf)
const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const semiBold = readFileSync(join(FONT_DIR, 'Pretendard-SemiBold.otf'));
const extraBold = readFileSync(join(FONT_DIR, 'Pretendard-ExtraBold.otf'));

function contentTypeOf(path: string): string {
  return path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

/** 카드 n번을 1080×1350 PNG로 렌더 — 미리보기(CardCanvas DOM)와 같은 JSX를 satori로 그린다. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id, n } = await params;

  // RLS로 접근 제어 (본사 전체 / 같은 지점)
  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from('card_news')
    .select('id, branch_id, mode, cards, branches(name)')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '카드뉴스를 찾지 못했어요' }, { status: 404 });

  const cards = (row.cards ?? []) as (InfoCard | ImageCard)[];
  const idx = Number.parseInt(n, 10);
  const card = Number.isInteger(idx) ? cards[idx] : undefined;
  if (!card) return NextResponse.json({ error: '카드가 없어요' }, { status: 404 });

  const branchName = (row.branches as unknown as { name: string } | null)?.name ?? '';
  const frame = await getFrameFor(row.branch_id);

  // 이미지형: 사진을 서버에서 받아 data URI로 — satori가 외부 URL을 fetch 하다 실패하는 일을 없앤다
  let photoSrc: string | null = null;
  const photoPath = row.mode === 'image' ? (card as ImageCard).photo_path : '';
  if (photoPath) {
    const admin = getAdminSupabase();
    const { data: blob } = await admin.storage.from('post-photos').download(photoPath);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      photoSrc = `data:${contentTypeOf(photoPath)};base64,${buf.toString('base64')}`;
    }
  }

  return new ImageResponse(
    (
      <CardCanvas
        mode={row.mode as 'info' | 'image'}
        card={card}
        tokens={frame.tokens}
        branchName={branchName}
        photoSrc={photoSrc}
        pageIndex={idx}
        pageCount={cards.length}
      />
    ),
    {
      width: CARD_W,
      height: CARD_H,
      fonts: [
        { name: 'Pretendard', data: semiBold, weight: 600, style: 'normal' },
        { name: 'Pretendard', data: extraBold, weight: 800, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
