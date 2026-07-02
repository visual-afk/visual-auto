import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callAI, loadFileSafeFor, loadBranchKnowledgeFor, loadPromptFor, parseJsonResponse } from '@/lib/generation/ai-client';
import { loadKeywordContext } from '@/lib/generation/keywords';

export const maxDuration = 60;

/** 추천 주제 2~3개. topic-rules.md(예진매니저 관리) + 지점 키워드 + 디자이너 입력 기반. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const chips: string[] = body.treatment_chips || [];
  const notes: string = body.user_notes || '';

  // 본사·멀티지점은 고른 지점(소속 검증), 그 외엔 본인 지점
  let branchName = member.branchName;
  let branchId = member.branchId;
  if (body.branch_id && canActOnBranch(member, body.branch_id)) {
    const { data: b } = await getAdminSupabase()
      .from('branches')
      .select('id, name')
      .eq('id', body.branch_id)
      .maybeSingle();
    if (b) {
      branchName = b.name;
      branchId = b.id;
    }
  }

  const rules = await loadFileSafeFor('knowledge/seo/topic-rules.md', branchId);
  const branchKnowledge = await loadBranchKnowledgeFor(branchName, branchId);
  const keywordContext = await loadKeywordContext(branchId);
  const instruction = await loadPromptFor('recommend-topics', branchId);

  // AI 없거나 실패 시 폴백: 규칙 파일에서 캠페인/지점 강조 주제 뽑기
  const fallback = () => fallbackTopics(rules, branchName);

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ topics: fallback() });
  }

  try {
    const result = await callAI({
      system: [
        instruction,
        '',
        '--- 추천 규칙 (topic-rules.md) ---',
        rules || '(규칙 파일 비어있음 — 기본 미용 주제로)',
        keywordContext
          ? `\n--- 이번 달 키워드 조사 (검색량/경쟁도 — ⭐는 우선 추천) ---\n${keywordContext}`
          : '',
        branchKnowledge ? `\n--- 지점 컨텍스트 (${branchName}) ---\n${branchKnowledge}` : '',
      ].join('\n'),
      userMessage: [
        `지점: ${branchName ?? ''}`,
        `오늘 시술: ${chips.join(', ') || '(미선택)'}`,
        `디자이너 기록: ${notes || '(없음)'}`,
        '',
        '위와 어울리는 추천 주제 2~3개를 JSON으로.',
      ].join('\n'),
      temperature: 0.6,
      maxTokens: 800,
      json: true,
    });
    const parsed = parseJsonResponse<{ topics: { title: string; reason: string }[] }>(result.text);
    if (!parsed.topics?.length) return NextResponse.json({ topics: fallback() });
    return NextResponse.json({ topics: parsed.topics.slice(0, 3) });
  } catch {
    return NextResponse.json({ topics: fallback() });
  }
}

/** 규칙 파일에서 캠페인 + 지점강조 + 기본 주제를 단순 추출 */
function fallbackTopics(rules: string, branch: string | null) {
  const topics: { title: string; reason: string }[] = [];
  const section = (title: string) => {
    const re = new RegExp(`##[^\\n]*${title}[^\\n]*\\n([\\s\\S]*?)(\\n##|$)`);
    const m = rules.match(re);
    if (!m) return [];
    return m[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.replace(/^-\s*/, ''));
  };
  for (const t of section('밀 주제')) topics.push({ title: t, reason: '이번 달 캠페인 주제예요' });
  if (branch) {
    const branchLine = section('지점별 강조').find((l) => l.startsWith(branch));
    if (branchLine) {
      const kws = branchLine.replace(`${branch}:`, '').split(',')[0].trim();
      if (kws) topics.push({ title: kws, reason: `${branch} 핵심 주제예요` });
    }
  }
  for (const t of section('기본 주제')) topics.push({ title: t, reason: '검색이 꾸준한 주제예요' });
  return topics.slice(0, 3);
}
