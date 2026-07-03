import { NextResponse } from 'next/server';
import { requireMember, resolveWriteBranch } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  callAIDelimited,
  friendlyAIError,
  loadKnowledgeFor,
  loadBranchKnowledgeFor,
  loadPromptFor,
  loadTemplate,
} from '@/lib/generation/ai-client';
import { parsePhotoGuide } from '@/lib/generation/photo-guide';
import { loadKeywordContext } from '@/lib/generation/keywords';
import type { GeneratedPost, SeoOptimizedPost } from '@/lib/types';

export const maxDuration = 300;

const TEMPLATE_BY_TYPE: Record<string, string> = {
  정보형: 'info-post',
  스토리형: 'story-post',
  시즌형: 'seasonal-post',
};

/** "태그1, 태그2" 또는 줄바꿈·불릿 목록을 배열로 */
function splitList(s: string | undefined): string[] {
  return (s ?? '')
    .split(/[,\n]/)
    .map((v) => v.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function splitLines(s: string | undefined): string[] {
  return (s ?? '')
    .split('\n')
    .map((v) => v.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));

  // 작업 지점 결정: 본사·멀티지점은 지점을 골라야 함, 단일지점은 본인 지점
  const resolved = await resolveWriteBranch(member, body.branch_id);
  if ('error' in resolved) return resolved.error;
  const { branchId, branchName } = resolved;

  const topic: string = (body.recommended_topic || body.topic || '').trim();
  const chips: string[] = body.treatment_chips || [];
  const notes: string = (body.user_notes || '').trim();
  const postType: string = body.post_type || '정보형';
  if (!topic) return NextResponse.json({ error: '주제를 골라주세요' }, { status: 400 });

  try {
    const knowledge = await loadKnowledgeFor(branchId);
    const branchKnowledge = await loadBranchKnowledgeFor(branchName, branchId);
    const keywordContext = await loadKeywordContext(branchId);
    const template = loadTemplate(TEMPLATE_BY_TYPE[postType] || 'info-post');
    const writerPrompt = await loadPromptFor('blog-writer', branchId);
    const seoPrompt = await loadPromptFor('seo-optimizer', branchId);

    // 1) 초안 — 디자이너 기록을 1인칭 경험으로 녹임 (EEAT)
    // 긴 본문을 JSON 문자열로 받으면 Gemini의 이스케이프 누락으로 파싱이 깨져 구분자 포맷으로 받는다
    const draftSections = await callAIDelimited(
      {
        system: [
          writerPrompt,
          '\n\n--- 비주얼살롱 지식베이스 ---\n',
          knowledge,
          branchKnowledge ? `\n\n--- 지점 특화 (${branchName}) ---\n${branchKnowledge}` : '',
          keywordContext
            ? `\n\n--- 이번 달 키워드 조사 (이 키워드를 본문에 우선 반영, ⭐ 최우선) ---\n${keywordContext}`
            : '',
          '\n\n--- 글 구조 템플릿 ---\n',
          template,
          '\n\n--- 중요 지침 ---\n',
          '디자이너가 직접 적은 "오늘의 시술 기록"을 글 속에 1인칭 경험담으로 자연스럽게 녹여라.',
          '실제 디자이너가 겪은 일처럼 구체적으로 써서 신뢰도(EEAT)를 높여라. 기록을 그대로 복붙하지 말고 풀어써라.',
        ].join(''),
        userMessage: [
          `지점: ${branchName}`,
          `주제: ${topic}`,
          `오늘 시술: ${chips.join(', ') || '(미선택)'}`,
          `디자이너 오늘의 기록(1인칭으로 녹일 것): ${notes || '(없음)'}`,
          `글유형: ${postType}`,
          '',
          '위 주제로 블로그 글을 작성하세요. 지식베이스/템플릿을 참고하되 자연스럽게.',
          '사진이 들어가면 좋은 위치에는 [IMAGE] 블록(종류/구도/포인트/alt)을 넣으세요.',
        ].join('\n'),
        temperature: 0.7,
        maxTokens: 16000, // 본문 7,000~9,000자 기준으로 여유 있게
      },
      [
        { name: 'TITLE', description: '블로그 제목 한 줄' },
        { name: 'META_DESCRIPTION', description: '메타 설명 (150자 이내) 한 줄' },
        { name: 'TAGS', description: '쉼표로 구분한 태그 5~8개 한 줄' },
        { name: 'CONTENT', description: '마크다운 본문 전체 (7,000자 이상, [IMAGE] 블록 포함)' },
        { name: 'IMAGE_SUGGESTIONS', description: '이미지 제안 목록 (한 줄에 하나씩)', required: false },
      ],
    );
    const draft: GeneratedPost = {
      title: draftSections.TITLE,
      meta_description: draftSections.META_DESCRIPTION,
      tags: splitList(draftSections.TAGS),
      content: draftSections.CONTENT,
      image_suggestions: splitLines(draftSections.IMAGE_SUGGESTIONS),
    };

    // 2) SEO 최적화 — 입력도 JSON 대신 일반 텍스트로 전달
    const seoSections = await callAIDelimited(
      {
        system: seoPrompt,
        userMessage: [
          '원본 블로그 글:',
          `제목: ${draft.title}`,
          `메타 설명: ${draft.meta_description}`,
          `태그: ${draft.tags.join(', ')}`,
          '본문:',
          draft.content,
          '',
          `타겟 주제/키워드: ${topic}`,
          'SEO 관점에서 최적화하세요. [IMAGE] 블록은 그대로 유지하세요.',
        ].join('\n'),
        temperature: 0.3,
        maxTokens: 16000, // 최적화 본문도 draft 만큼 길어질 수 있음
      },
      [
        { name: 'OPTIMIZED_TITLE', description: '최적화된 블로그 제목 한 줄' },
        { name: 'OPTIMIZED_META_DESCRIPTION', description: '최적화된 메타 설명 (150자 이내) 한 줄' },
        { name: 'OPTIMIZED_TAGS', description: '쉼표로 구분한 최적화 태그 5~8개 한 줄' },
        { name: 'OPTIMIZED_CONTENT', description: '최적화된 마크다운 본문 전체 ([IMAGE] 블록 유지)' },
        { name: 'SEO_SCORE', description: '0~100 사이 숫자 하나', required: false },
      ],
    );
    const seoScore = Number.parseInt(seoSections.SEO_SCORE ?? '', 10);
    const optimized: SeoOptimizedPost = {
      optimized_title: seoSections.OPTIMIZED_TITLE,
      optimized_meta_description: seoSections.OPTIMIZED_META_DESCRIPTION,
      optimized_tags: splitList(seoSections.OPTIMIZED_TAGS),
      optimized_content: seoSections.OPTIMIZED_CONTENT,
      seo_score: Number.isFinite(seoScore) ? seoScore : null,
    };

    // 3) 사진 가이드 파싱 + 본문 마커 치환
    const fromFinal = parsePhotoGuide(optimized.optimized_content || draft.content);
    const fromDraft = parsePhotoGuide(draft.content);
    const guide = fromFinal.guide.length ? fromFinal.guide : fromDraft.guide;
    const finalBody = fromFinal.body;

    // 4) posts 저장 (RLS: 본인 글) — 고쳐쓰기(post_id)는 기존 초안을 덮어써 유령 초안 누적을 막는다
    const supabase = await getServerSupabase();
    const fields = {
      branch_id: branchId,
      treatment_chips: chips,
      user_notes: notes || null,
      recommended_topic: topic,
      title: optimized.optimized_title || draft.title,
      meta_description: optimized.optimized_meta_description || draft.meta_description,
      tags: optimized.optimized_tags || draft.tags || [],
      content: finalBody,
      photo_guide: guide,
      seo_score: optimized.seo_score ?? null,
    };

    const postId: string = (body.post_id || '').trim();
    if (postId) {
      const { data: post, error } = await supabase
        .from('posts')
        .update(fields)
        .eq('id', postId)
        .eq('author_id', member.userId)
        .eq('status', 'draft')
        .select('*')
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!post) return NextResponse.json({ error: '덮어쓸 초안을 찾지 못했어요' }, { status: 400 });
      return NextResponse.json({ post });
    }

    const { data: post, error } = await supabase
      .from('posts')
      .insert({ ...fields, author_id: member.userId, status: 'draft' })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ post });
  } catch (e) {
    console.error('[generate]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
