import { NextResponse } from 'next/server';
import { requireMember, resolveWriteBranch } from '@/lib/auth';
import { callAI, friendlyAIError, loadPromptFor, loadBranchKnowledgeFor, parseJsonResponse } from '@/lib/generation/ai-client';
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

  // 지점 결정: 본사·멀티지점은 골라야 함, 단일지점은 본인 지점
  const resolved = await resolveWriteBranch(member, body.branch_id);
  if ('error' in resolved) return resolved.error;
  const { branchId, branchName } = resolved;

  if (!process.env.GEMINI_API_KEY) {
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
    console.error('[review-reply]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
