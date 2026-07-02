/**
 * 원장 코칭 대시보드 집계 — 사람별 릴스·블로그·리뷰 활동 + 평균 조회수 + 저장률 → 규칙 기반 코칭.
 * LLM 불필요(lib/metrics.ts 의 buildDiagnosis 스타일). resolveRange 재사용.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolveRange, type PeriodType } from '@/lib/metrics';
import type { Role } from '@/lib/roles';

/** 챙겨야 하는 이유(플래그) */
export type CoachFlag = 'no_post' | 'low_save' | 'low_views';

const FLAG_LABEL: Record<CoachFlag, string> = {
  no_post: '이번 주 안 올림',
  low_save: '저장률 낮음',
  low_views: '조회수 낮음',
};

/** 저장률이 이 아래면 "저장은 안 되는" 상태로 본다 */
const LOW_SAVE_RATE = 0.02;
/** 지점 평균 대비 이 비율보다 낮으면 노출이 약한 것으로 본다 */
const LOW_VIEWS_RATIO = 0.5;

export interface MemberCoaching {
  userId: string;
  reelsCount: number;
  blogCount: number;
  reviewCount: number;
  totalCount: number;
  avgViews: number;
  /** Σsaves / Σviews (저장 수가 입력된 콘텐츠 기준). 데이터 없으면 null */
  saveRate: number | null;
  flags: CoachFlag[];
  /** 대표 사유 라벨 (요약 배너용) */
  primaryFlagLabel: string | null;
  status: 'good' | 'warn';
  /** 원장이 화면에서 읽는 코칭 포인트 */
  tip: string | null;
  /** 카톡에 붙여넣는 문구 (이름 포함) */
  kakao: string | null;
  /** 액션 버튼 라벨 */
  actionLabel: string | null;
}

interface ContentRow {
  author_id: string;
  views: number | null;
  saves: number | null;
}

export interface CoachingInputMember {
  userId: string;
  displayName: string;
  role: Role;
}

/**
 * 지점(branchId) 또는 전체(null=본사)의 사람별 코칭 지표.
 * members 로 넘긴 사람만 계산한다(이름·역할이 코칭 문구에 필요).
 */
export async function aggregateTeamCoaching(
  members: CoachingInputMember[],
  branchId: string | string[] | null,
  period: PeriodType,
  ref?: string,
): Promise<Map<string, MemberCoaching>> {
  const range = resolveRange(period, ref);
  const admin = getAdminSupabase();
  const startTs = `${range.start}T00:00:00`;
  const endTs = `${range.end}T23:59:59`;

  let reelsQ = admin
    .from('reels')
    .select('author_id, views, saves')
    .eq('status', 'published')
    .gte('published_at', startTs)
    .lte('published_at', endTs);
  let postsQ = admin
    .from('posts')
    .select('author_id, views, saves')
    .eq('status', 'published')
    .gte('published_at', startTs)
    .lte('published_at', endTs);
  let logsQ = admin
    .from('review_reply_logs')
    .select('author_id')
    .gte('created_at', startTs)
    .lte('created_at', endTs);
  const branchIds = Array.isArray(branchId) ? branchId : branchId ? [branchId] : [];
  if (branchIds.length > 0) {
    reelsQ = reelsQ.in('branch_id', branchIds);
    postsQ = postsQ.in('branch_id', branchIds);
    logsQ = logsQ.in('branch_id', branchIds);
  }

  const [reelsRes, postsRes, logsRes] = await Promise.all([reelsQ, postsQ, logsQ]);

  const reels = (reelsRes.data ?? []) as ContentRow[];
  const posts = (postsRes.data ?? []) as ContentRow[];
  const logs = (logsRes.data ?? []) as { author_id: string }[];

  // 사람별 누적
  type Acc = {
    reelsCount: number;
    blogCount: number;
    reviewCount: number;
    viewSum: number;
    viewN: number;
    saveSum: number;
    saveViewSum: number; // 저장이 입력된 콘텐츠의 조회수 합 (저장률 분모)
  };
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) { a = { reelsCount: 0, blogCount: 0, reviewCount: 0, viewSum: 0, viewN: 0, saveSum: 0, saveViewSum: 0 }; acc.set(id, a); }
    return a;
  };
  const addContent = (rows: ContentRow[], kind: 'reel' | 'blog') => {
    for (const r of rows) {
      const a = get(r.author_id);
      if (kind === 'reel') a.reelsCount++; else a.blogCount++;
      if (r.views != null) { a.viewSum += r.views; a.viewN++; }
      if (r.saves != null && r.views != null && r.views > 0) { a.saveSum += r.saves; a.saveViewSum += r.views; }
    }
  };
  addContent(reels, 'reel');
  addContent(posts, 'blog');
  for (const l of logs) get(l.author_id).reviewCount++;

  // 지점 평균 조회수 (low_views 판정 기준)
  const allViews = [...reels, ...posts].filter((r) => r.views != null);
  const branchAvgViews = allViews.length
    ? Math.round(allViews.reduce((s, r) => s + (r.views || 0), 0) / allViews.length)
    : 0;

  const out = new Map<string, MemberCoaching>();
  for (const m of members) {
    const a = acc.get(m.userId) ?? { reelsCount: 0, blogCount: 0, reviewCount: 0, viewSum: 0, viewN: 0, saveSum: 0, saveViewSum: 0 };
    const totalCount = a.reelsCount + a.blogCount + a.reviewCount;
    const avgViews = a.viewN ? Math.round(a.viewSum / a.viewN) : 0;
    const saveRate = a.saveViewSum > 0 ? a.saveSum / a.saveViewSum : null;

    const flags: CoachFlag[] = [];
    if (totalCount === 0) flags.push('no_post');
    if (saveRate != null && saveRate < LOW_SAVE_RATE) flags.push('low_save');
    if (
      totalCount > 0 &&
      a.viewN > 0 &&
      branchAvgViews > 0 &&
      avgViews < branchAvgViews * LOW_VIEWS_RATIO
    ) flags.push('low_views');

    const primary = flags[0] ?? null;
    const coaching = primary ? buildCoaching(primary, m.displayName) : { tip: null, kakao: null, actionLabel: null };

    out.set(m.userId, {
      userId: m.userId,
      reelsCount: a.reelsCount,
      blogCount: a.blogCount,
      reviewCount: a.reviewCount,
      totalCount,
      avgViews,
      saveRate,
      flags,
      primaryFlagLabel: primary ? FLAG_LABEL[primary] : null,
      status: flags.length ? 'warn' : 'good',
      ...coaching,
    });
  }
  return out;
}

/** 플래그별 코칭 문구(화면용 tip + 카톡용 kakao + 버튼 라벨) */
function buildCoaching(flag: CoachFlag, name: string): { tip: string; kakao: string; actionLabel: string } {
  switch (flag) {
    case 'no_post':
      return {
        tip: '막막해서 못 올리는 거예요. 질책 대신 레퍼런스 하나 골라 "이거 따라 찍어봐"가 좋아요.',
        kakao: `${name}님, 이번 주 아직 콘텐츠가 없네요. 부담 갖지 말고 잘된 릴스 하나 골라서 그대로 따라 찍어볼까요? 레퍼런스 보내드릴게요 🙌`,
        actionLabel: '레퍼런스 주기',
      };
    case 'low_save':
      return {
        tip: '조회수는 나오는데 "하고 싶다"까진 안 가요. 비포/애프터를 넣어보라고 하면 돼요.',
        kakao: `${name}님, 요즘 조회수는 잘 나오는데 저장률이 조금 낮아요. 비포/애프터 컷 한 장 넣어서 "따라 하고 싶게" 만들어볼까요? 😊`,
        actionLabel: '코칭 보내기',
      };
    case 'low_views':
      return {
        tip: '콘텐츠는 올라오는데 노출이 약해요. 첫 3초 후킹이랑 제목을 같이 손보면 좋아요.',
        kakao: `${name}님, 콘텐츠는 꾸준히 올라오는데 조회수가 아직 안 붙어요. 첫 3초 후킹이랑 제목을 같이 다듬어볼까요?`,
        actionLabel: '코칭 보내기',
      };
  }
}
