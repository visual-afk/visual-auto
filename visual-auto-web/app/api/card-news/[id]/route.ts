import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { clampCardCount } from '@/lib/cardnews/cards';

/** 카드뉴스 수정/발행/조회수 — reels 패턴 동일. RLS가 접근을 가른다. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = await getServerSupabase();

  if (body.action === 'update') {
    const patch: Record<string, unknown> = {};
    if (Array.isArray(body.cards)) {
      patch.cards = body.cards;
      patch.card_count = clampCardCount(body.cards.length);
    }
    if (typeof body.caption === 'string') patch.caption = body.caption;
    if (Array.isArray(body.hashtags)) patch.hashtags = body.hashtags;
    if (!Object.keys(patch).length) return NextResponse.json({ error: '바꿀 내용이 없어요' }, { status: 400 });
    const { data: row, error } = await supabase.from('card_news').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: '카드뉴스를 찾지 못했어요' }, { status: 404 });
    return NextResponse.json({ cardNews: row });
  }

  if (body.action === 'publish') {
    const { error } = await supabase
      .from('card_news')
      .update({
        status: 'published',
        published_url: body.published_url || null,
        published_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'record_views') {
    const next = body.next_check ? new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10) : null;
    const { error } = await supabase
      .from('card_news')
      .update({
        published_url: body.published_url ?? undefined,
        views: typeof body.views === 'number' ? body.views : undefined,
        saves: typeof body.saves === 'number' ? body.saves : undefined,
        views_updated_at: new Date().toISOString(),
        next_check_at: next,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '알 수 없는 동작' }, { status: 400 });
}

/** 초안 삭제 (발행본은 보호). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { error } = await supabase.from('card_news').delete().eq('id', id).eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
