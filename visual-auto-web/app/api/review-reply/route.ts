import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callAI, loadPromptFor, loadBranchKnowledgeFor, parseJsonResponse } from '@/lib/generation/ai-client';
import { loadKeywordContext } from '@/lib/generation/keywords';

export const maxDuration = 60;

interface Reply {
  text: string;
  keywords_used: string[];
}

/** 리뷰 붙여넣기 → 매장 톤 답글 2~3개 (상위노출 키워드 반영). DB 저장 없음. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const reviewText: string = (body.review_text || '').trim();
  const chips: string[] = body.treatment_chips || [];
  if (!reviewText) {
    return NextResponse.json({ error: '리뷰 내용을 붙여넣어 주세요' }, { status: 400 });
  }

  // 지점 결정: 본사는 골라야 함, 그 외엔 본인 지점
  let branchName = member.branchName;
  let branchId = member.branchId;
  if (member.role === 'hq_admin') {
    if (!body.branch_id) {
      return NextResponse.json({ error: '어느 지점 리뷰인지 골라주세요' }, { status: 400 });
    }
    const { data: b } = await getAdminSupabase()
      .from('branches')
      .select('id, name')
      .eq('id', body.branch_id)
      .maybeSingle();
    if (!b) return NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 400 });
    branchName = b.name;
    branchId = b.id;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '답글 기능 설정에 문제가 있어요. 관리자에게 알려주세요.' }, { status: 503 });
  }

  const prompt = await loadPromptFor('review-reply', branchId);
  const keywordContext = await loadKeywordContext(branchId);
  const branchKnowledge = await loadBranchKnowledgeFor(branchName, branchId);

  try {
    const result = await callAI({
      system: [
        prompt,
        branchName ? `\n--- 지점: ${branchName} ---` : '',
        keywordContext
          ? `\n--- 상위노출 키워드 (이 중 1~2개를 답글에 자연스럽게) ---\n${keywordContext}`
          : '',
        branchKnowledge ? `\n--- 지점 브랜드/서비스 컨텍스트 ---\n${branchKnowledge}` : '',
      ].join('\n'),
      userMessage: [
        `고객 리뷰:\n"""${reviewText}"""`,
        chips.length ? `참고 시술: ${chips.join(', ')}` : '',
        '',
        '위 리뷰에 다는 답글 후보 2~3개를 JSON으로.',
      ].join('\n'),
      temperature: 0.8,
      maxTokens: 2048,
      json: true,
    });
    const parsed = parseJsonResponse<{ replies: Reply[] }>(result.text);
    const replies = (parsed.replies || []).filter((r) => r.text?.trim()).slice(0, 3);
    if (!replies.length) {
      return NextResponse.json({ error: '답글을 만들지 못했어요. 다시 시도해주세요.' }, { status: 502 });
    }
    return NextResponse.json({ replies });
  } catch (e) {
    const raw = (e as Error).message || '';
    console.error('[review-reply]', raw);
    if (/429|quota|rate.?limit/i.test(raw)) {
      return NextResponse.json({ error: '지금 사용량이 많아요. 잠시 후 다시 시도해주세요.' }, { status: 429 });
    }
    return NextResponse.json({ error: '답글을 쓰는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
