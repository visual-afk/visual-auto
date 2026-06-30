import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  callAI,
  streamAI,
  loadKnowledge,
  loadBranchKnowledge,
  loadPrompt,
  loadTemplate,
  parseJsonResponse,
} from '@/lib/generation/ai-client';
import { parsePhotoGuide } from '@/lib/generation/photo-guide';
import { loadKeywordContext } from '@/lib/generation/keywords';

export const maxDuration = 300;

const TEMPLATE_BY_TYPE: Record<string, string> = {
  정보형: 'info-post',
  스토리형: 'story-post',
  시즌형: 'seasonal-post',
};

/** AI 에러 원문을 디자이너용 친절한 한국어로 (원문은 서버 로그) */
function friendlyError(raw: string): string {
  if (/429|quota|rate.?limit/i.test(raw)) {
    return '지금 글쓰기 사용량이 많아요. 잠시 후 다시 시도해주세요.';
  }
  if (/api.?key|invalid|401|403/i.test(raw)) {
    return '글쓰기 기능 설정에 문제가 있어요. 관리자에게 알려주세요.';
  }
  return '글을 쓰는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.';
}

/** 스트리밍 결과(마크다운)에서 첫 `# 제목` 줄과 본문을 분리 */
function splitTitle(full: string): { title: string; content: string } {
  const trimmed = full.trim();
  const lines = trimmed.split('\n');
  const idx = lines.findIndex((l) => /^#\s+\S/.test(l.trim()));
  if (idx !== -1) {
    const title = lines[idx].trim().replace(/^#\s+/, '').trim();
    const content = lines.slice(idx + 1).join('\n').trim();
    return { title, content };
  }
  // 폴백: 첫 비어있지 않은 줄을 제목으로
  const first = lines.findIndex((l) => l.trim());
  if (first !== -1) {
    return {
      title: lines[first].trim().replace(/^#+\s*/, ''),
      content: lines.slice(first + 1).join('\n').trim(),
    };
  }
  return { title: '', content: trimmed };
}

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));

  // 작업 지점 결정: 본사는 글쓰기 시 지점을 골라야 함, 그 외엔 본인 지점
  let branchId = member.branchId;
  let branchName = member.branchName;
  if (member.role === 'hq_admin') {
    if (!body.branch_id) {
      return NextResponse.json({ error: '어느 지점으로 쓸지 골라주세요' }, { status: 400 });
    }
    const { data: b } = await getAdminSupabase()
      .from('branches')
      .select('id, name')
      .eq('id', body.branch_id)
      .maybeSingle();
    if (!b) return NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 400 });
    branchId = b.id;
    branchName = b.name;
  }
  if (!branchId) {
    return NextResponse.json({ error: '지점이 없는 계정이에요' }, { status: 400 });
  }

  const topic: string = (body.recommended_topic || body.topic || '').trim();
  const chips: string[] = body.treatment_chips || [];
  const notes: string = (body.user_notes || '').trim();
  const postType: string = body.post_type || '정보형';
  if (!topic) return NextResponse.json({ error: '주제를 골라주세요' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        const knowledge = loadKnowledge();
        const branchKnowledge = loadBranchKnowledge(branchName);
        const keywordContext = await loadKeywordContext(branchId);
        const template = loadTemplate(TEMPLATE_BY_TYPE[postType] || 'info-post');
        const writerPrompt = loadPrompt('blog-writer-stream');

        const system = [
          writerPrompt,
          '\n\n--- 비주얼살롱 지식베이스 ---\n',
          knowledge,
          branchKnowledge ? `\n\n--- 지점 특화 (${branchName}) ---\n${branchKnowledge}` : '',
          keywordContext
            ? `\n\n--- 이번 달 키워드 조사 (이 키워드를 본문에 우선 반영, ⭐ 최우선) ---\n${keywordContext}`
            : '',
          '\n\n--- 글 구조 템플릿 ---\n',
          template,
        ].join('');

        const userMessage = [
          `지점: ${branchName}`,
          `주제: ${topic}`,
          `오늘 시술: ${chips.join(', ') || '(미선택)'}`,
          `디자이너 오늘의 기록(1인칭으로 녹일 것): ${notes || '(없음)'}`,
          `글유형: ${postType}`,
          '',
          '위 주제로 블로그 글을 작성하세요. 첫 줄은 `# 제목`, 그다음 빈 줄, 본문.',
          'SEO를 처음부터 반영하고, 사진 자리에는 [IMAGE] 블록을 인라인으로 넣으세요. JSON·코드블록 금지.',
        ].join('\n');

        // 1) 실시간 스트리밍 생성 — 토큰을 받는 즉시 클라이언트로 흘려보냄
        let full = '';
        for await (const piece of streamAI({ system, userMessage, temperature: 0.7, maxTokens: 8000 })) {
          full += piece;
          send({ type: 'token', text: piece });
        }

        // 2) 마무리 — 제목/본문/사진가이드 분리
        const { title, content } = splitTitle(full);
        const { body: finalBody, guide } = parsePhotoGuide(content);

        // 3) 메타데이터(태그/메타설명/SEO점수)는 짧은 비스트리밍 콜로 추출
        let tags: string[] = [];
        let metaDescription: string | null = null;
        let seoScore: number | null = null;
        try {
          const metaRes = await callAI({
            system: [
              '너는 네이버 블로그 SEO 메타데이터 생성기다. 주어진 본문을 읽고 메타데이터만 만든다.',
              'JSON으로만 답한다: {"meta_description":"메인 키워드 포함 150자 이내 클릭유도 문구","tags":["태그5~10개"],"seo_score":0~100}',
            ].join('\n'),
            userMessage: [
              `주제/키워드: ${topic}`,
              `제목: ${title}`,
              '',
              '본문:',
              finalBody.slice(0, 6000),
            ].join('\n'),
            temperature: 0.3,
            maxTokens: 600,
          });
          const meta = parseJsonResponse<{ meta_description: string; tags: string[]; seo_score: number }>(metaRes.text);
          tags = meta.tags || [];
          metaDescription = meta.meta_description || null;
          seoScore = meta.seo_score ?? null;
        } catch (e) {
          console.error('[generate meta]', (e as Error).message); // 메타 실패해도 글은 저장
        }

        // 4) posts 저장 (RLS: 본인 글 insert)
        const supabase = await getServerSupabase();
        const { data: post, error } = await supabase
          .from('posts')
          .insert({
            branch_id: branchId,
            author_id: member.userId,
            treatment_chips: chips,
            user_notes: notes || null,
            recommended_topic: topic,
            status: 'draft',
            title: title || topic,
            meta_description: metaDescription,
            tags,
            content: finalBody,
            photo_guide: guide,
            seo_score: seoScore,
          })
          .select('*')
          .single();

        if (error) {
          console.error('[generate save]', error.message);
          send({ type: 'error', error: '글은 다 썼는데 저장 중 문제가 생겼어요. 다시 시도해주세요.' });
          return;
        }
        send({ type: 'done', post });
      } catch (e) {
        const raw = (e as Error).message || '';
        console.error('[generate]', raw);
        send({ type: 'error', error: friendlyError(raw) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
