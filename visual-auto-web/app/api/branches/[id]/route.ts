import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 지점 정보 수정 (본사 전용) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireHq();
  if ('error' in res) return res.error;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const update: Record<string, string | number | null> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: '지점 이름을 입력해주세요' }, { status: 400 });
    update.name = name;
  }
  for (const key of ['region', 'knowledge_slug', 'naver_blog_url', 'imweb_url', 'address'] as const) {
    if (typeof body[key] === 'string') update[key] = body[key].trim() || null;
  }
  // GPS 좌표·반경 (숫자 또는 null)
  for (const key of ['lat', 'lng', 'geofence_radius_m'] as const) {
    if (key in body) {
      const v = body[key];
      update[key] = v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없어요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { error } = await admin.from('branches').update(update).eq('id', id);
  if (error) {
    const msg = error.code === '23505' ? '같은 이름의 지점이 이미 있어요' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** 지점 삭제 (본사 전용) — 소속 멤버·글이 있으면 차단 (cascade 사고 방지) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireHq();
  if ('error' in res) return res.error;
  const { id } = await params;

  const admin = getAdminSupabase();
  const [{ count: memberCount }, { count: postCount }] = await Promise.all([
    admin.from('branch_users').select('id', { count: 'exact', head: true }).eq('branch_id', id),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('branch_id', id),
  ]);
  if ((memberCount || 0) > 0 || (postCount || 0) > 0) {
    return NextResponse.json(
      { error: '소속 멤버·글이 있어 삭제할 수 없어요. 먼저 멤버를 옮기거나 내보내세요.' },
      { status: 409 },
    );
  }

  const { error } = await admin.from('branches').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
