import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { buildCatalog, isValidTarget, readFileDefault } from '@/lib/generation/catalog';

/** null/문자열 branch_id 를 정규화 ('' | 'null' | undefined → null) */
function normBranch(v: unknown): string | null {
  if (v == null || v === '' || v === 'null') return null;
  return String(v);
}

/**
 * GET ?branch_id= : 편집 카탈로그 + 해당 범위의 오버라이드 값.
 * branch_id 없으면 전사 공통 범위.
 */
export async function GET(request: Request) {
  const gate = await requireHq();
  if ('error' in gate) return gate.error;

  const branchId = normBranch(new URL(request.url).searchParams.get('branch_id'));
  const admin = getAdminSupabase();

  let query = admin.from('content_overrides').select('kind, slug, content, updated_at');
  query = branchId ? query.eq('branch_id', branchId) : query.is('branch_id', null);
  const { data: overrides } = await query;

  const byKey = new Map((overrides ?? []).map((o) => [`${o.kind}:${o.slug}`, o]));

  const items = buildCatalog().map((c) => {
    const ov = byKey.get(`${c.kind}:${c.slug}`);
    return {
      ...c,
      fileDefault: readFileDefault(c.kind, c.slug),
      override: ov ? ov.content : null,
      updatedAt: ov ? ov.updated_at : null,
    };
  });

  return NextResponse.json({ branchId, items });
}

/** PUT {kind, slug, branch_id, content} : 오버라이드 저장 (있으면 갱신, 없으면 생성). */
export async function PUT(request: Request) {
  const gate = await requireHq();
  if ('error' in gate) return gate.error;
  const { member } = gate;

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  const slug = body.slug;
  const branchId = normBranch(body.branch_id);
  const content = typeof body.content === 'string' ? body.content : '';

  if (!isValidTarget(kind, slug)) {
    return NextResponse.json({ error: '편집할 수 없는 항목이에요' }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: '내용을 입력해주세요 (원본으로 되돌리려면 되돌리기를 누르세요)' }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 부분 유니크 인덱스라 upsert 대신 존재 확인 후 갱신/생성
  let existing = admin.from('content_overrides').select('id').eq('kind', kind).eq('slug', slug);
  existing = branchId ? existing.eq('branch_id', branchId) : existing.is('branch_id', null);
  const { data: found } = await existing.maybeSingle();

  const payload = { content, updated_by: member.userId, updated_at: new Date().toISOString() };

  if (found) {
    const { error } = await admin.from('content_overrides').update(payload).eq('id', found.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from('content_overrides')
      .insert({ kind, slug, branch_id: branchId, ...payload });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE {kind, slug, branch_id} : 오버라이드 삭제 = 파일 원본으로 복귀. */
export async function DELETE(request: Request) {
  const gate = await requireHq();
  if ('error' in gate) return gate.error;

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  const slug = body.slug;
  const branchId = normBranch(body.branch_id);

  if (!isValidTarget(kind, slug)) {
    return NextResponse.json({ error: '편집할 수 없는 항목이에요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  let del = admin.from('content_overrides').delete().eq('kind', kind).eq('slug', slug);
  del = branchId ? del.eq('branch_id', branchId) : del.is('branch_id', null);
  const { error } = await del;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
