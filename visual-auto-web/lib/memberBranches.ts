import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * user_id → member_branches의 branch_id[] 맵 조회.
 * userIds 생략 시 전체 조회 (지점별 집계 화면용).
 */
export async function fetchMemberBranchMap(
  admin: SupabaseClient,
  userIds?: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds && userIds.length === 0) return map;

  let q = admin.from('member_branches').select('user_id, branch_id');
  if (userIds) q = q.in('user_id', userIds);
  const { data } = await q;

  for (const r of (data ?? []) as { user_id: string; branch_id: string }[]) {
    const arr = map.get(r.user_id) ?? [];
    arr.push(r.branch_id);
    map.set(r.user_id, arr);
  }
  return map;
}

/**
 * 멤버의 실제 활동 지점 집합 = member_branches ∪ 홈 branch_id.
 * 본사 배정 UI가 전체 교체 시 홈 행을 지울 수 있어 RLS 헬퍼 my_branch_ids()처럼 홈과 union.
 */
export function effectiveBranchIds(
  map: Map<string, string[]>,
  userId: string,
  homeBranchId: string | null,
): string[] {
  const set = new Set(map.get(userId) ?? []);
  if (homeBranchId) set.add(homeBranchId);
  return [...set];
}

/** 지점별 멤버 수 (다지점 소속은 각 지점에 1명씩, 고유 user_id 기준) */
export function countMembersByBranch(
  members: { user_id: string; branch_id: string | null }[],
  map: Map<string, string[]>,
): Map<string, number> {
  const byBranch = new Map<string, Set<string>>();
  for (const m of members) {
    for (const bid of effectiveBranchIds(map, m.user_id, m.branch_id)) {
      const set = byBranch.get(bid) ?? new Set<string>();
      set.add(m.user_id);
      byBranch.set(bid, set);
    }
  }
  return new Map([...byBranch].map(([bid, set]) => [bid, set.size]));
}
