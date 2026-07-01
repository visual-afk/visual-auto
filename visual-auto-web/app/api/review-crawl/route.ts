import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  fetchPublicReviews,
  resolvePlaceId,
  reviewPageUrl,
  ReviewsBlockedError,
} from '@/lib/naver/place';

export const maxDuration = 60;

/**
 * 지점의 네이버 공개 리뷰를 (실험적으로) 수집해 목록으로 반환.
 * 네이버 캡차로 자주 막히므로, 실패 시 프론트는 review_url 딥링크로 폴백한다.
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));

  // 지점 결정: 본사는 골라야 함, 그 외엔 본인 지점
  let branchId = member.branchId;
  if (member.role === 'hq_admin') {
    if (!body.branch_id) {
      return NextResponse.json({ error: '어느 지점 리뷰인지 골라주세요' }, { status: 400 });
    }
    branchId = body.branch_id;
  }
  if (!branchId) {
    return NextResponse.json({ error: '지점 정보를 찾을 수 없어요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: branch } = await admin
    .from('branches')
    .select('id, name, naver_place_id, naver_short_url')
    .eq('id', branchId)
    .maybeSingle();
  if (!branch) return NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 400 });

  // placeId 확보(없으면 naver.me 해석 후 캐시)
  let placeId: string | null = branch.naver_place_id;
  if (!placeId && branch.naver_short_url) {
    placeId = await resolvePlaceId(branch.naver_short_url);
    if (placeId) {
      await admin.from('branches').update({ naver_place_id: placeId }).eq('id', branch.id);
    }
  }
  if (!placeId) {
    return NextResponse.json(
      { error: '이 지점은 아직 네이버 리뷰 링크가 등록되지 않았어요' },
      { status: 501 },
    );
  }

  const review_url = reviewPageUrl(placeId);

  try {
    let reviews;
    try {
      reviews = await fetchPublicReviews(placeId, 10, 'hairshop');
    } catch (inner) {
      // hairshop 이 거부되면 generic 'place' 로 1회 폴백
      if (inner instanceof ReviewsBlockedError) {
        reviews = await fetchPublicReviews(placeId, 10, 'place');
      } else {
        throw inner;
      }
    }
    return NextResponse.json({ reviews, review_url });
  } catch (e) {
    if (e instanceof ReviewsBlockedError) {
      // 캡차/봇차단 — 딥링크로 폴백하도록 review_url 함께 반환
      return NextResponse.json(
        { error: '네이버가 자동 불러오기를 막았어요. "리뷰 보러가기"로 열어서 복사해주세요.', review_url },
        { status: 502 },
      );
    }
    console.error('[review-crawl]', (e as Error).message);
    return NextResponse.json(
      { error: '리뷰를 불러오는 중 문제가 생겼어요. "리뷰 보러가기"로 열어주세요.', review_url },
      { status: 500 },
    );
  }
}
