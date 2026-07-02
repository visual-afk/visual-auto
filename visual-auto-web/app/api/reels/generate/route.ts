import { NextResponse } from 'next/server';
import { requireMember, resolveWriteBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';
import { callAI, friendlyAIError, loadPromptFor, loadBranchKnowledgeFor, parseJsonResponse } from '@/lib/generation/ai-client';
import { getContentProfile, compileProfileContext } from '@/lib/reels';

export const maxDuration = 120;

interface Cut { time: string; shot: string; caption: string }
interface Structure { title: string; cuts: Cut[]; why: string }

/** 분석 + 프로필 + 시술/메모/앵글 → 컷 단위 릴스 구성. reels(draft) 저장. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const analysis = body.reference_analysis ?? null;
  const chips: string[] = body.treatment_chips || [];
  const notes: string = (body.notes || '').trim();
  const angle: string = body.angle === '욕망' ? '욕망' : '담백';

  // 지점 결정 (본사·멀티지점은 선택, 단일지점은 본인 지점)
  const resolved = await resolveWriteBranch(member, body.branch_id);
  if ('error' in resolved) return resolved.error;
  const { branchId, branchName } = resolved;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '릴스 기획 설정에 문제가 있어요. 관리자에게 알려주세요.' }, { status: 503 });
  }

  const prompt = await loadPromptFor('reels-structure', branchId);
  const profile = compileProfileContext(await getContentProfile(member.userId, branchId));
  const branchKnowledge = await loadBranchKnowledgeFor(branchName, branchId);

  try {
    const result = await callAI({
      system: [
        prompt,
        profile ? `\n--- 내 콘텐츠 프로필 ---\n${profile}` : '',
        branchKnowledge ? `\n--- 지점 컨텍스트 (${branchName}) ---\n${branchKnowledge}` : '',
      ].join('\n'),
      userMessage: [
        analysis ? `레퍼런스 분석(JSON):\n${JSON.stringify(analysis)}` : '레퍼런스 없음 — 기본 비포/애프터 구조로.',
        `시술: ${chips.join(', ') || '(미선택)'}`,
        `디자이너 메모: ${notes || '(없음)'}`,
        `앵글: ${angle}`,
        '',
        '위로 컷 단위 릴스 구성을 JSON으로.',
      ].join('\n'),
      temperature: 0.8,
      maxTokens: 1500,
      json: true,
    });
    const structure = parseJsonResponse<Structure>(result.text);
    if (!structure.cuts?.length) {
      return NextResponse.json({ error: '구성을 만들지 못했어요. 다시 시도해주세요.' }, { status: 502 });
    }

    // reels(draft) 저장 (RLS: 본인 insert)
    const supabase = await getServerSupabase();
    const { data: reel, error } = await supabase
      .from('reels')
      .insert({
        branch_id: branchId,
        author_id: member.userId,
        reference_analysis: analysis,
        treatment_chips: chips,
        notes: notes || null,
        angle,
        structure: structure.cuts,
        title: structure.title || null,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) {
      console.error('[reels save]', error.message);
      return NextResponse.json({ structure, reel: null, warn: '구성은 됐는데 저장 중 문제가 생겼어요.' });
    }
    return NextResponse.json({ structure, reel });
  } catch (e) {
    console.error('[reels generate]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
