import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';

/** 릴스 발행/조회수 기록 (posts 패턴 동일). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = await getServerSupabase();

  if (body.action === 'publish') {
    const { error } = await supabase
      .from('reels')
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
      .from('reels')
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
