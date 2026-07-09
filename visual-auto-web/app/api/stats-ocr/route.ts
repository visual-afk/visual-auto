import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { canManage } from '@/lib/roles';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callAI, friendlyAIError, parseJsonResponse } from '@/lib/generation/ai-client';

export const maxDuration = 60;

interface OcrBlogPost {
  title: string;
  views: number;
}
interface OcrPlace {
  statDate?: string;
  period?: 'day' | 'week' | 'month';
  placeViews?: number | null;
  inflows?: { name: string; count: number }[];
  reviewCount?: number | null;
}
interface OcrResult {
  kind: 'blog' | 'place' | 'unknown';
  blogPosts?: OcrBlogPost[];
  place?: OcrPlace;
}

const OCR_SYSTEM = [
  '너는 네이버 통계 화면 스크린샷을 읽는 OCR 도우미다. 화면 종류를 판별해 JSON으로만 답한다.',
  '',
  '1) 네이버 블로그 통계 (블로그 통계/크리에이터 어드바이저 — 글 제목별 조회수 목록):',
  '{"kind":"blog","blogPosts":[{"title":"글 제목","views":123}]}',
  '- 제목은 화면에 보이는 그대로(말줄임 … 포함). views는 숫자만 (1,234 → 1234, "1.2만" → 12000).',
  '',
  '2) 스마트플레이스 통계 (플레이스 조회/방문, 유입 채널·키워드, 리뷰 수):',
  '{"kind":"place","place":{"statDate":"YYYY-MM-DD","period":"day|week|month","placeViews":123,"inflows":[{"name":"네이버검색","count":56}],"reviewCount":78}}',
  '- statDate: 화면의 통계 기간 시작일. 기간이 "최근 7일"류면 period="week", 월 단위면 "month", 하루면 "day".',
  '- placeViews: 플레이스 조회수(방문 횟수). inflows: 유입 채널 또는 유입 키워드와 그 횟수.',
  '- 안 보이는 값은 null 또는 빈 배열로.',
  '',
  '3) 둘 다 아니면 {"kind":"unknown"}.',
  '숫자에 쉼표·단위가 붙어 있으면 정수로 변환해라. JSON 외 다른 텍스트는 절대 출력하지 마라.',
].join('\n');

/** 제목 매칭용 정규화: 공백/문장부호 제거 + 소문자 + 말줄임 제거 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[…]+$/g, '')
    .replace(/[\s ]+/g, '')
    .replace(/[.,!?~·:;'"“”‘’()\[\]-]/g, '');
}

/** OCR 제목(말줄임 가능) ↔ 글 제목 매칭 */
function titleMatches(ocrTitle: string, postTitle: string): boolean {
  const a = norm(ocrTitle);
  const b = norm(postTitle);
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b) || b.includes(a);
}

/**
 * 통계 스크린샷(이미지) → OCR로 조회수 추출.
 * - 블로그 통계: 내 글 제목과 매칭해 {post, views} 후보 반환 (적용은 기존 record_views로)
 * - 스마트플레이스 통계: 플레이스 지표 반환 (적용은 /api/place-stats로, 원장·본사만)
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '사진 읽기 설정에 문제가 있어요. 관리자에게 문의해주세요.' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File).slice(0, 5);
  if (!files.length) {
    return NextResponse.json({ error: '통계 화면 스크린샷을 올려주세요' }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: '사진이 너무 커요(8MB 이하). 스크린샷은 대개 괜찮아요.' }, { status: 400 });
    }
  }

  try {
    const blogPosts: OcrBlogPost[] = [];
    const placeParts: OcrPlace[] = [];

    for (const file of files) {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const result = await callAI({
        system: OCR_SYSTEM,
        userMessage: '이 통계 스크린샷을 읽어 JSON으로 줘.',
        image: { base64, mimeType: file.type || 'image/jpeg' },
        json: true,
        temperature: 0,
        maxTokens: 2048,
      });
      const parsed = parseJsonResponse<OcrResult>(result.text);
      if (parsed.kind === 'blog') {
        for (const p of parsed.blogPosts || []) {
          if (p?.title?.trim() && Number.isFinite(Number(p.views))) {
            blogPosts.push({ title: p.title.trim(), views: Number(p.views) });
          }
        }
      } else if (parsed.kind === 'place' && parsed.place) {
        placeParts.push(parsed.place);
      }
    }

    // 플레이스 스크린샷이 여러 장이면 보이는 값끼리 합친다 (조회수 화면 + 유입 화면 따로 찍는 경우)
    const place: OcrPlace | null = placeParts.length
      ? placeParts.reduce((acc, p) => ({
          statDate: p.statDate || acc.statDate,
          period: p.period || acc.period,
          placeViews: p.placeViews ?? acc.placeViews ?? null,
          inflows: (p.inflows?.length ? p.inflows : acc.inflows) ?? [],
          reviewCount: p.reviewCount ?? acc.reviewCount ?? null,
        }))
      : null;

    // ── 블로그 통계: 내 글과 제목 매칭 ──
    if (blogPosts.length) {
      // 같은 제목이 여러 장에 겹치면 조회수 큰 값 하나만
      const dedup = new Map<string, OcrBlogPost>();
      for (const p of blogPosts) {
        const key = norm(p.title);
        const prev = dedup.get(key);
        if (!prev || p.views > prev.views) dedup.set(key, p);
      }

      const admin = getAdminSupabase();
      const { data: myPosts } = await admin
        .from('posts')
        .select('id, title, views')
        .eq('author_id', member.userId)
        .not('title', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      const items = [...dedup.values()].map((p) => {
        const post = (myPosts || []).find((mp) => titleMatches(p.title, mp.title || ''));
        return {
          ocrTitle: p.title,
          views: p.views,
          post: post ? { id: post.id, title: post.title, views: post.views } : null,
        };
      });
      return NextResponse.json({ type: 'blog', items });
    }

    // ── 스마트플레이스 통계 ──
    if (place) {
      if (!canManage(member.role)) {
        return NextResponse.json(
          { error: '플레이스 통계는 원장님·본사만 올릴 수 있어요.' },
          { status: 403 },
        );
      }
      return NextResponse.json({ type: 'place', place });
    }

    return NextResponse.json(
      { error: '사진에서 통계를 찾지 못했어요. 블로그 통계나 스마트플레이스 통계 화면을 캡처해주세요.' },
      { status: 422 },
    );
  } catch (e) {
    console.error('[stats-ocr]', (e as Error).message);
    const { message, status } = friendlyAIError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
