import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 카드뉴스 브랜드 프레임 토큰 관리 (본사 전용). */

const COLOR_KEYS = ['bg', 'surface', 'ink', 'point', 'ctaBg', 'ctaInk'] as const;
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function sanitizeTokens(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  const obj = raw as Record<string, unknown>;
  for (const k of COLOR_KEYS) {
    const v = obj[k];
    if (v == null || v === '') continue;
    if (typeof v !== 'string' || !HEX.test(v)) return null;
    out[k] = v;
  }
  if (typeof obj.logoText === 'string') out.logoText = obj.logoText.slice(0, 40);
  return out;
}

export async function GET() {
  const gate = await requireHq();
  if ('error' in gate) return gate.error;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('card_frames')
    .select('id, branch_id, mode, tokens, updated_at, branches(name)')
    .order('mode');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ frames: data ?? [] });
}

/** body: { branch_id: string | null, mode: 'info'|'image', tokens } — 지점 기본은 branch_id null */
export async function PUT(request: Request) {
  const gate = await requireHq();
  if ('error' in gate) return gate.error;
  const body = await request.json().catch(() => ({}));

  const branchId: string | null = body.branch_id || null;
  const mode = body.mode === 'image' ? 'image' : 'info';
  const tokens = sanitizeTokens(body.tokens);
  if (!tokens) return NextResponse.json({ error: '컬러는 #RRGGBB 형식으로 넣어주세요' }, { status: 422 });

  const admin = getAdminSupabase();
  const fields = { mode, tokens, updated_by: gate.member.userId, updated_at: new Date().toISOString() };

  // branch_id null(지점 기본)은 partial unique 인덱스라 upsert onConflict가 안 잡힌다 — 직접 분기
  const { data: existing } = branchId
    ? await admin.from('card_frames').select('id').eq('branch_id', branchId).maybeSingle()
    : await admin.from('card_frames').select('id').is('branch_id', null).maybeSingle();

  const query = existing
    ? admin.from('card_frames').update(fields).eq('id', existing.id).select('*').single()
    : admin.from('card_frames').insert({ ...fields, branch_id: branchId }).select('*').single();
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ frame: data });
}
