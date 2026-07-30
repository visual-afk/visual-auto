import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logEdits } from '@/lib/strategy/history';

const FIELDS = ['owner_name', 'money_formula', 'current_problem', 'cause_note', 'decide_next', 'subtitle'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (res.member.role !== 'hq_admin') return NextResponse.json({ error: '본사 전용이에요' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) patch[f] = body[f];
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 값이 없어요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: before } = await admin.from('strategy_areas').select('*').eq('id', id).maybeSingle();
  if (!before) return NextResponse.json({ error: '영역을 찾을 수 없어요 (마이그레이션 필요)' }, { status: 404 });

  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from('strategy_areas').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEdits(
    admin, 'area', id, res.member.userId,
    FIELDS.filter((f) => f in patch).map((f) => ({ field: f, oldValue: (before as Record<string, unknown>)[f], newValue: patch[f] })),
  );
  return NextResponse.json({ ok: true });
}
