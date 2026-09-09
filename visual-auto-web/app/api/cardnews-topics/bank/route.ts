import { NextResponse } from 'next/server';
import { requireHq } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFileTopicBank } from '@/lib/cardnews/topic-engine';
import { loadTopicBank, regenerateTopicBank } from '@/lib/cardnews/topic-bank-store';
import { friendlyAIError } from '@/lib/generation/ai-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 면 단위로 AI를 여러 번 부른다

/** 브랜드별 주제 은행 현황 — 어느 브랜드가 아직 은행이 없는지 본다. */
export async function GET() {
  const res = await requireHq();
  if ('error' in res) return res.error;

  const admin = getAdminSupabase();
  const { data: brands } = await admin.from('branches').select('id, name').eq('kind', 'brand').order('name');

  const banks = [];
  for (const b of (brands ?? []) as { id: string; name: string }[]) {
    const stored = await loadTopicBank(b.name, b.id);
    banks.push({
      branch_id: b.id,
      name: b.name,
      source: stored?.source ?? null, // 'file' = 손으로 만든 은행(트리필드), 'db' = AI 생성
      entry_count: stored?.entryCount ?? 0,
      generated_at: stored?.generatedAt ?? null,
      editable: !getFileTopicBank(b.name), // 파일 은행은 여기서 다시 뽑지 않는다
    });
  }
  return NextResponse.json({ banks });
}

/**
 * 주제 은행 다시 뽑기 — 브랜드 컨셉 파일을 근거로 AI가 은행을 새로 만든다.
 * 은행만 바꾸며, 이미 편성된 주제(cardnews_topics)는 건드리지 않는다.
 * 새 은행을 편성에 반영하려면 "지금 다시 편성"을 이어서 누른다.
 */
export async function POST(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;

  const body = await request.json().catch(() => ({}));
  const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
  if (!branchId) return NextResponse.json({ error: '브랜드를 골라주세요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: brand } = await admin
    .from('branches')
    .select('id, name')
    .eq('id', branchId)
    .eq('kind', 'brand')
    .maybeSingle();
  if (!brand) return NextResponse.json({ error: '브랜드를 찾지 못했어요' }, { status: 404 });

  // 트리필드는 손으로 관리하는 파일 은행이 항상 이기므로, 여기서 만들어봐야 쓰이지 않는다
  if (getFileTopicBank(brand.name)) {
    return NextResponse.json(
      { error: `${brand.name}은(는) 코드에 있는 은행 파일을 씁니다. 그 파일을 고쳐주세요.` },
      { status: 400 },
    );
  }

  try {
    const result = await regenerateTopicBank(brand.name, brand.id, res.member.userId);
    return NextResponse.json({
      ok: true,
      name: brand.name,
      entry_count: result.entryCount,
      sections: result.bank.sections.length,
      warnings: result.warnings,
    });
  } catch (e) {
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
