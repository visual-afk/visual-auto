import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  callAIDelimited,
  friendlyAIError,
  loadPromptFor,
  loadBranchKnowledgeFor,
  loadFileSafeFor,
} from '@/lib/generation/ai-client';
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
 * 카드뉴스 생성 — 두 가지 소스를 지원한다.
 *   1) 글 기반: body { post_id, card_count?, card_news_id? } — 브랜드 프레임 모드(info/image)로 카드 구성.
 *   2) 주제 기반: body { branch_id, topic, card_count?, card_news_id? } — 글 없이 주제만으로 정보형 카드 생성.
 * 두 경로 모두 브랜드 카드뉴스 컨셉(knowledge/cardnews/concept-{브랜드}.md)을 system에 주입한다.
 * card_news_id 가 있으면 기존 초안을 새 구성으로 덮어쓴다 (장수 조절 "다시 뽑기").
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const postId: string = (body.post_id || '').trim();
  const topic: string = (body.topic || '').trim();

  const admin = getAdminSupabase();

  // ── 소스 확정: 글(post) 또는 주제(topic) ──
  let branchId: string;
  let branchName: string;
  let post: { id: string; title: string | null; content: string | null; photos: unknown } | null = null;

  if (postId) {
    const { data } = await admin
      .from('posts')
      .select('id, branch_id, author_id, title, content, tags, photos, branches(name)')
      .eq('id', postId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: '글을 찾지 못했어요' }, { status: 404 });
    if (data.author_id !== member.userId && !canActOnBranch(member, data.branch_id)) {
      return NextResponse.json({ error: '이 글에 접근할 수 없어요' }, { status: 403 });
    }
    branchId = data.branch_id;
    branchName = (data.branches as unknown as { name: string } | null)?.name ?? '';
    post = { id: data.id, title: data.title, content: data.content, photos: data.photos };
  } else if (topic) {
    branchId = (body.branch_id || '').trim();
    if (!branchId) return NextResponse.json({ error: '브랜드(지점)를 골라주세요' }, { status: 400 });
    if (!canActOnBranch(member, branchId)) {
      return NextResponse.json({ error: '이 브랜드에 접근할 수 없어요' }, { status: 403 });
    }
    const { data: br } = await admin.from('branches').select('name').eq('id', branchId).maybeSingle();
    if (!br) return NextResponse.json({ error: '브랜드를 찾지 못했어요' }, { status: 404 });
    branchName = br.name ?? '';
  } else {
    return NextResponse.json({ error: '원본 글이나 주제가 필요해요' }, { status: 400 });
  }

  // 주제 기반 사진형: 업로드된 사진 경로(post-photos 버킷) 배열
  const providedPhotos: string[] = Array.isArray(body.photos)
    ? body.photos.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0).slice(0, MAX_CARDS)
    : [];
  if (!post && body.mode === 'image' && providedPhotos.length === 0) {
    return NextResponse.json({ error: '사진을 한 장 이상 올려주세요' }, { status: 400 });
  }

  const frame = await getFrameFor(branchId);
  // 글 기반은 프레임 모드를 따른다. 주제 기반은 사진형 요청(+사진 있음)이면 image, 아니면 info.
  const mode: 'info' | 'image' = post
    ? frame.mode
    : body.mode === 'image' && providedPhotos.length > 0
      ? 'image'
      : 'info';
  if (!canMakeCardNews(member.role, mode)) {
    return NextResponse.json({ error: '카드뉴스는 지금 본사만 만들 수 있어요' }, { status: 403 });
  }

  try {
    const promptName =
      mode === 'image'
        ? post
          ? 'card-news-image'
          : 'card-news-image-topic'
        : post
          ? 'card-news-info'
          : 'card-news-topic';
    const prompt = await loadPromptFor(promptName, branchId);
    const knowledge = await loadBranchKnowledgeFor(branchName, branchId);
    const concept = await loadFileSafeFor(`knowledge/cardnews/concept-${branchName}.md`, branchId);
    const system = [
      prompt,
      concept ? `\n\n--- 브랜드 카드뉴스 컨셉 (${branchName}) — 반드시 이 컨셉을 따를 것 ---\n${concept}` : '',
      knowledge ? `\n\n--- 브랜드/지점 지식 (${branchName}) — 이 톤을 따를 것 ---\n${knowledge}` : '',
    ].join('');

    let cards;
    let caption: string | null = null;
    let hashtags: string[] = [];
    let cardCount: number;

    if (mode === 'info') {
      cardCount = clampCardCount(body.card_count ?? 5);
      const pointCount = cardCount - 2;
      const material = post
        ? [`블로그 글 제목: ${post.title ?? ''}`, '본문:', post.content ?? '']
        : [`주제: ${topic}`];
      const sections = await callAIDelimited(
        {
          system,
          userMessage: [
            `브랜드/지점: ${branchName}`,
            ...material,
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
      // image: 글 기반이면 post.photos, 주제 기반이면 업로드된 photos 경로.
      const photoPaths: string[] = post
        ? (Array.isArray(post.photos) ? (post.photos as PostPhoto[]).map((ph) => ph.storage_path) : []).slice(0, MAX_CARDS)
        : providedPhotos;
      const phraseCount = Math.max(photoPaths.length, post ? 3 : 1);
      const material = post
        ? [`블로그 글 제목: ${post.title ?? ''}`, '본문:', post.content ?? '']
        : [`주제: ${topic}`];
      const sections = await callAIDelimited(
        {
          system,
          userMessage: [
            `브랜드/지점: ${branchName}`,
            ...material,
            '',
            `사진 수: ${phraseCount} — 한 줄 문구(헤드라인)도 정확히 ${phraseCount}개.`,
          ].join('\n'),
          temperature: 0.6,
          maxTokens: 3000,
        },
        [
          { name: 'PHRASES', description: `한 줄 문구(헤드라인) ${phraseCount}개, 한 줄에 하나씩` },
          { name: 'CAPTION', description: '인스타 캡션' },
          { name: 'HASHTAGS', description: '해시태그 8~10개 한 줄' },
        ],
      );
      const phrases = (sections.PHRASES ?? '')
        .split('\n')
        .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean);
      const basis: string[] = photoPaths.length ? photoPaths : Array.from({ length: phraseCount }, () => '');
      const slots: ImageCard[] = basis.map((path, i, arr) => ({
        idx: i,
        photo_path: path,
        phrase: phrases[i] ?? '',
        // 살롱(글 기반)만 마지막 카드에 예약 배지. 주제형(뉴스·매거진)은 헤드라인만.
        is_cta: post ? i === arr.length - 1 : false,
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
    const fields = { mode, card_count: cardCount, cards, caption, hashtags };

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
      .insert({ ...fields, post_id: post?.id ?? null, branch_id: branchId, author_id: member.userId, status: 'draft' })
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
