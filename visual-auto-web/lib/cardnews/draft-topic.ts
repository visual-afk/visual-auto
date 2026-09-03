/**
 * 주제 → 카드뉴스 초안 자동 생성 (공용 코어).
 * "이 주제로 만들기" 버튼(/api/card-news topic 경로)과 매일 크론(auto-draft)이 같은 코드를 쓴다.
 * 홍보 자아 금지: 마케팅 지식(branch-*.md)은 주입하지 않고 카드뉴스 컨셉 파일만 쓴다 (07 §5-2).
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { kstTodayStr } from '@/lib/kst';
import { callAIDelimited, loadPromptFor, loadFileSafeFor } from '@/lib/generation/ai-client';
import { buildInfoCards, clampCardCount, parsePointCards, type InfoCard } from './cards';

/** 생성 재료 — cardnews_topics 행의 부분집합 (자유 주제는 material만 채워도 된다) */
export interface TopicDraftSource {
  material: string;
  section?: string | null;
  frame?: string | null;
  fact_seed?: string | null;
  hint?: string | null;
  headline_draft?: string | null;
  bubble?: string | null;
}

export interface TopicDraft {
  cards: InfoCard[];
  cardCount: number;
  coverHook: string;
  bubble: string; // 표지 말풍선 대사 (주제 행의 bubble 컬럼에도 채운다)
  photoHint: string; // 표지 사진 지시문
  caption: string | null;
  hashtags: string[];
}

/** 주제 하나로 정보형 카드 + 인스타 캡션 + 해시태그를 뽑는다. */
export async function generateTopicDraft(
  source: TopicDraftSource,
  branchName: string,
  branchId: string | null,
  cardCount = 5,
): Promise<TopicDraft> {
  const topic = source.headline_draft?.trim() || source.material;
  const prompt = await loadPromptFor('card-news-topic', branchId);
  const concept = await loadFileSafeFor(`knowledge/cardnews/concept-${branchName}.md`, branchId);
  const system = [
    prompt,
    concept ? `\n\n--- 브랜드 카드뉴스 컨셉 (${branchName}) — 반드시 이 컨셉을 따를 것 ---\n${concept}` : '',
  ].join('');

  const count = clampCardCount(cardCount);
  const pointCount = count - 2;
  const material = [
    `주제: ${topic}`,
    source.section && `편성 면(섹션): ${source.section}`,
    source.frame && `뉴스 프레임: ${source.frame}`,
    source.fact_seed && `팩트 시드(이 근거 밖의 수치·단정 금지): ${source.fact_seed}`,
    source.hint && `표지 훅 힌트: ${source.hint}`,
    source.bubble && `말풍선 아이디어: ${source.bubble}`,
  ].filter(Boolean) as string[];

  const sections = await callAIDelimited(
    {
      system,
      userMessage: [`브랜드/지점: ${branchName}`, ...material, '', `포인트 카드는 정확히 ${pointCount}장.`].join('\n'),
      temperature: 0.6,
      maxTokens: 4000,
    },
    [
      { name: 'COVER_HOOK', description: '표지 훅 — 줄당 8~14자, 최대 2줄' },
      { name: 'COVER_BUBBLE', description: '말풍선 대사 한 줄 — 팩트 당사자의 1인칭, 8~14자' },
      { name: 'COVER_PHOTO', description: '표지 사진 지시 한 줄 — 피사체 + 구도' },
      { name: 'POINT_CARDS', description: `포인트 카드 ${pointCount}장 — 카드 사이 --- 구분, 첫 줄 제목 + 본문 최대 2줄` },
      { name: 'CTA_TITLE', description: 'CTA 카드 제목 한 줄' },
      { name: 'CTA_BODY', description: 'CTA 배지 문구 한 줄' },
      { name: 'CAPTION', description: '인스타 캡션 3~4줄 — 정보 요약 + 저장·공유 유도, 홍보 문장 금지' },
      { name: 'HASHTAGS', description: '해시태그 8~10개 한 줄' },
    ],
  );

  const coverHook = sections.COVER_HOOK?.trim() ?? '';
  // 편성에 미리 적어둔 말풍선이 있으면 그게 우선 (사람 수정이 항상 이긴다)
  const bubble = source.bubble?.trim() || sections.COVER_BUBBLE?.trim().replace(/^["']|["']$/g, '') || '';
  const photoHint = sections.COVER_PHOTO?.trim() ?? '';
  const cards = buildInfoCards(
    count,
    coverHook,
    parsePointCards(sections.POINT_CARDS),
    sections.CTA_TITLE?.trim() ?? '',
    sections.CTA_BODY?.trim() ?? '프로필 링크 ↓',
    { bubble, photo_hint: photoHint },
  );
  const hashtags = (sections.HASHTAGS ?? '')
    .split(/\s+/)
    .map((t) => (t.startsWith('#') ? t : t ? `#${t}` : ''))
    .filter(Boolean)
    .slice(0, 10);
  return { cards, cardCount: count, coverHook, bubble, photoHint, caption: sections.CAPTION?.trim() || null, hashtags };
}

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 앞으로 daysAhead일 안의 편성 주제 중 초안이 없는 것(기획중)에 카드뉴스 초안을 자동 생성한다.
 * 한 번에 maxPerRun개까지 (크론 실행시간 한도) — 밀린 건 다음 실행이 이어서 처리.
 * 성공 시: card_news(draft, author 없음=자동) 생성 + 주제에 역링크 + 빈 헤드라인을 표지 훅으로 채움.
 */
export async function autoDraftUpcoming(daysAhead = 7, maxPerRun = 5): Promise<{ drafted: number; failed: number }> {
  const admin = getAdminSupabase();
  const today = kstTodayStr();
  const { data } = await admin
    .from('cardnews_topics')
    .select('id, branch_id, material, section, frame, fact_seed, hint, headline_draft, bubble, branches(name)')
    .is('card_news_id', null)
    .eq('status', 'planning')
    .gte('topic_date', today)
    .lte('topic_date', addDaysUTC(today, daysAhead))
    .order('topic_date', { ascending: true })
    .limit(maxPerRun);

  let drafted = 0;
  let failed = 0;
  for (const t of (data ?? []) as unknown as (TopicDraftSource & {
    id: string;
    branch_id: string;
    branches: { name: string } | null;
  })[]) {
    try {
      const branchName = t.branches?.name ?? '';
      const draft = await generateTopicDraft(t, branchName, t.branch_id, 5);
      const { data: row, error } = await admin
        .from('card_news')
        .insert({
          branch_id: t.branch_id,
          author_id: null, // 자동 생성 (0030에서 nullable)
          mode: 'info',
          card_count: draft.cardCount,
          cards: draft.cards,
          caption: draft.caption,
          hashtags: draft.hashtags,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      await admin
        .from('cardnews_topics')
        .update({
          card_news_id: row.id,
          ...(t.headline_draft?.trim() ? {} : { headline_draft: draft.coverHook }),
          ...(t.bubble?.trim() || !draft.bubble ? {} : { bubble: draft.bubble }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      drafted += 1;
    } catch (e) {
      failed += 1;
      console.error('[auto-draft]', t.id, (e as Error).message);
    }
  }
  return { drafted, failed };
}
