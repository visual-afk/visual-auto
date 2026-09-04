import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logEdits } from '@/lib/strategy/history';

const FIELDS = [
  'phenomenon', 'hypothesis', 'prediction', 'action', 'assignee_name', 'due_date',
  'check_metric_id', 'status', 'result_value', 'result_note', 'learned', 'promotion',
] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (res.member.role !== 'hq_admin') return NextResponse.json({ error: '본사 전용이에요' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const admin = getAdminSupabase();
  const { data: before } = await admin.from('strategy_experiments').select('*').eq('id', id).maybeSingle();
  if (!before) return NextResponse.json({ error: '실험을 찾을 수 없어요' }, { status: 404 });

  const b = before as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f];

  const status = (patch.status ?? b.status) as string;
  const resultValue = (patch.result_value ?? b.result_value) as string | null;
  const learned = (patch.learned ?? b.learned) as string | null;
  if (status === '완료' && (!resultValue || !learned)) {
    return NextResponse.json({ error: '완료하려면 결과 숫자와 배운 것이 필요해요' }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 값이 없어요' }, { status: 400 });

  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from('strategy_experiments').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEdits(admin, 'experiment', id, res.member.userId,
    FIELDS.filter((f) => f in patch).map((f) => ({ field: f, oldValue: b[f], newValue: patch[f] })));
  return NextResponse.json({ ok: true });
}
