import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 키워드 조사 set 삭제. 본사 전용. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '본사 계정만 삭제할 수 있어요' }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await getAdminSupabase().from('keyword_sets').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
