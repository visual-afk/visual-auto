import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';

/** 내 글 목록 (?scope=branch 면 우리 지점 전체) */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  const scope = new URL(request.url).searchParams.get('scope');

  const supabase = await getServerSupabase();
  let q = supabase.from('posts').select('*').order('created_at', { ascending: false });
  if (scope !== 'branch') q = q.eq('author_id', member.userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

const EDITABLE = ['title', 'content', 'meta_description', 'tags'] as const;

/** 글 수정 / 발행 / 조회수 입력 */
export async function PATCH(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;

  const body = await request.json().catch(() => ({}));
  const id: string = body.id;
  if (!id) return NextResponse.json({ error: 'id가 필요해요' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) patch[k] = body[k];

  // 발행 (⑥): 어디로 복사해 갔는지 + 상태 + 3일 뒤 리마인드
  if (body.action === 'publish') {
    patch.status = 'published';
    if (body.publish_target) patch.publish_target = body.publish_target;
    patch.published_at = new Date().toISOString();
    const d = new Date();
    d.setDate(d.getDate() + 3);
    patch.next_check_at = d.toISOString().slice(0, 10);
  }

  // 조회수 입력 (⑦)
  if (body.action === 'record_views') {
    if (body.published_url !== undefined) patch.published_url = String(body.published_url).trim();
    if (body.views !== undefined) patch.views = Number(body.views) || 0;
    patch.views_updated_at = new Date().toISOString();
    if (patch.status == null) patch.status = 'published';
    if (body.remind) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      patch.next_check_at = d.toISOString().slice(0, 10);
    } else {
      patch.next_check_at = null;
    }
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from('posts').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}
