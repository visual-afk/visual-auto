import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callAIDelimited, friendlyAIError, loadPromptFor, loadBranchKnowledgeFor } from '@/lib/generation/ai-client';
import { getFrameFor } from '@/lib/cardnews/frames';
import { canMakeCardNews } from '@/lib/flags';
import {
  buildInfoCards,
  clampCardCount,
  parsePointCards,
  MAX_CARDS,
  type ImageCard,
} from '@/lib/cardnews/cards';
import type { PostPhoto } from '@/lib/types';

export const maxDuration = 120;

/**
 * 카드뉴스 생성 — 글(post)에서 브랜드 모드에 따라 카드 구성.
 * body: { post_id, card_count?, card_news_id? }
 * card_news_id 가 있으면 기존 초안을 새 구성으로 덮어쓴다 (장수 조절 "다시 뽑기").
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const postId: string = (body.post_id || '').trim();
  if (!postId) return NextResponse.json({ error: '원본 글이 필요해요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: post } = await admin
    .from('posts')
    .select('id, branch_id, author_id, title, content, tags, photos, branches(name)')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: '글을 찾지 못했어요' }, { status: 404 });
  if (post.author_id !== member.userId && !canActOnBranch(member, post.branch_id)) {
    return NextResponse.json({ error: '이 글에 접근할 수 없어요' }, { status: 403 });
  }

  const branchName = (post.branches as unknown as { name: string } | null)?.name ?? '';
  const frame = await getFrameFor(post.branch_id);
  if (!canMakeCardNews(member.role, frame.mode)) {
    return NextResponse.json({ error: '카드뉴스는 지금 본사만 만들 수 있어요' }, { status: 403 });
  }

  try {
    const prompt = await loadPromptFor(frame.mode === 'image' ? 'card-news-image' : 'card-news-info', post.branch_id);
    const knowledge = await loadBranchKnowledgeFor(branchName, post.branch_id);
    const system = [
      prompt,
      knowledge ? `\n\n--- 브랜드/지점 지식 (${branchName}) — 이 톤을 따를 것 ---\n${knowledge}` : '',
    ].join('');

    let cards;
    let caption: string | null = null;
    let hashtags: string[] = [];
    let cardCount: number;

    if (frame.mode === 'info') {
      cardCount = clampCardCount(body.card_count ?? 5);
      const pointCount = cardCount - 2;
      const sections = await callAIDelimited(
        {
          system,
          userMessage: [
            `브랜드/지점: ${branchName}`,
            `블로그 글 제목: ${post.title ?? ''}`,
            '본문:',
            post.content ?? '',
            '',
            `포인트 카드는 정확히 ${pointCount}장.`,
          ].join('\n'),
          temperature: 0.6,
          maxTokens: 4000,
        },
        [
          { name: 'COVER_HOOK', description: '표지 훅 (최대 2줄)' },
          { name: 'POINT_CARDS', description: `포인트 카드 ${pointCount}장 — 카드 사이 --- 구분, 첫 줄 제목 + 본문 최대 2줄` },
          { name: 'CTA_TITLE', description: 'CTA 카드 제목 한 줄' },
          { name: 'CTA_BODY', description: 'CTA 배지 문구 한 줄' },
        ],
      );
      cards = buildInfoCards(
        cardCount,
        sections.COVER_HOOK?.trim() ?? '',
        parsePointCards(sections.POINT_CARDS),
        sections.CTA_TITLE?.trim() ?? '',
        sections.CTA_BODY?.trim() ?? '프로필 링크 ↓',
      );
    } else {
      const photos = (Array.isArray(post.photos) ? (post.photos as PostPhoto[]) : []).slice(0, MAX_CARDS);
      const phraseCount = Math.max(photos.length, 3);
      const sections = await callAIDelimited(
        {
          system,
          userMessage: [
            `브랜드/지점: ${branchName}`,
            `블로그 글 제목: ${post.title ?? ''}`,
            '본문:',
            post.content ?? '',
            '',
            `사진 수: ${phraseCount} — 한 줄 문구도 정확히 ${phraseCount}개.`,
          ].join('\n'),
          temperature: 0.6,
          maxTokens: 3000,
        },
        [
          { name: 'PHRASES', description: `한 줄 문구 ${phraseCount}개, 한 줄에 하나씩` },
          { name: 'CAPTION', description: '인스타 캡션 (지역+시술/고민/결과/예약 유도 4줄)' },
          { name: 'HASHTAGS', description: '해시태그 8~10개 한 줄' },
        ],
      );
      const phrases = (sections.PHRASES ?? '')
        .split('\n')
        .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean);
      const slots: ImageCard[] = (photos.length ? photos : Array.from({ length: 3 }, () => null)).map((p, i, arr) => ({
        idx: i,
        photo_path: p ? p.storage_path : '',
        phrase: phrases[i] ?? '',
        is_cta: i === arr.length - 1,
      }));
      cards = slots;
      cardCount = slots.length;
      caption = sections.CAPTION?.trim() || null;
      hashtags = (sections.HASHTAGS ?? '')
        .split(/\s+/)
        .map((t) => (t.startsWith('#') ? t : t ? `#${t}` : ''))
        .filter(Boolean)
        .slice(0, 10);
    }

    const supabase = await getServerSupabase();
    const fields = { mode: frame.mode, card_count: cardCount, cards, caption, hashtags };

    const existingId: string = (body.card_news_id || '').trim();
    if (existingId) {
      const { data: row, error } = await supabase
        .from('card_news')
        .update(fields)
        .eq('id', existingId)
        .eq('status', 'draft')
        .select('*')
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: '덮어쓸 카드뉴스를 찾지 못했어요' }, { status: 400 });
      return NextResponse.json({ cardNews: row });
    }

    const { data: row, error } = await supabase
      .from('card_news')
      .insert({ ...fields, post_id: post.id, branch_id: post.branch_id, author_id: member.userId, status: 'draft' })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cardNews: row });
  } catch (e) {
    console.error('[card-news]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
