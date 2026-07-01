import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';
import { callAI, loadPromptFor, loadBranchKnowledgeFor, parseJsonResponse } from '@/lib/generation/ai-client';
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

  // 지점 결정
  let branchId = member.branchId;
  let branchName = member.branchName;
  if (member.role === 'hq_admin') {
    if (!body.branch_id) return NextResponse.json({ error: '지점을 골라주세요' }, { status: 400 });
    const { data: b } = await getAdminSupabase().from('branches').select('id, name').eq('id', body.branch_id).maybeSingle();
    if (!b) return NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 400 });
    branchId = b.id;
    branchName = b.name;
  }
  if (!branchId) return NextResponse.json({ error: '지점이 없는 계정이에요' }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
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
    return NextResponse.json({ error: '릴스 기획 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
