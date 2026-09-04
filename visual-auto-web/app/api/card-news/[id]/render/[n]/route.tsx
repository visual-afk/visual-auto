import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getFrameFor } from '@/lib/cardnews/frames';
import { photoDataUri, renderCard, type CardNewsCard } from '@/lib/cardnews/render';

export const runtime = 'nodejs';

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

  const cards = (row.cards ?? []) as CardNewsCard[];
  const idx = Number.parseInt(n, 10);
  const card = Number.isInteger(idx) ? cards[idx] : undefined;
  if (!card) return NextResponse.json({ error: '카드가 없어요' }, { status: 404 });

  const branchName = (row.branches as unknown as { name: string } | null)?.name ?? '';
  const frame = await getFrameFor(row.branch_id);

  return renderCard({
    mode: row.mode as 'info' | 'image',
    card,
    tokens: frame.tokens,
    branchName,
    photoSrc: await photoDataUri(card),
    pageIndex: idx,
    pageCount: cards.length,
  });
}
