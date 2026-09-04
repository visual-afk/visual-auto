import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * 리뷰 답글 "사용(복사)" 이벤트 로그 — 코칭 카드의 리뷰 개수 카운트용.
 * 답글 텍스트·리뷰 원문은 저장하지 않는다(프라이버시). 사용 시점 1행만 남긴다.
 * 본사는 body.branch_id 로 지점 지정 가능, 그 외엔 본인 지점.
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const branchId =
    body.branch_id && canActOnBranch(member, body.branch_id) ? body.branch_id : member.branchId;

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('review_reply_logs')
    .insert({ author_id: member.userId, branch_id: branchId ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
