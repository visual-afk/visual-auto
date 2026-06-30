import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { crawlDate } from '@/lib/handsos/crawl';

export const maxDuration = 300;

/** 대시보드 [새로고침] — 선택 지점의 어제치만 빠르게 크롤→upsert. 원장(자기지점)/본사. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role === 'designer' || member.role === 'intern') {
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  let branchId = member.branchId;
  if (member.role === 'hq_admin') branchId = body.branch_id || branchId;
  if (!branchId) return NextResponse.json({ error: '지점을 골라주세요' }, { status: 400 });

  // 원장은 자기 지점만
  if (member.role === 'branch_owner' && body.branch_id && body.branch_id !== member.branchId) {
    return NextResponse.json({ error: '내 지점만 새로고침할 수 있어요' }, { status: 403 });
  }

  const { data: b } = await getAdminSupabase()
    .from('branches')
    .select('handsos_pk')
    .eq('id', branchId)
    .maybeSingle();
  if (!b?.handsos_pk) {
    return NextResponse.json({ error: '이 지점은 아직 HandSOS 연동이 안 됐어요' }, { status: 400 });
  }

  // 어제 날짜 (KST 기준 대략)
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const date = d.toISOString().slice(0, 10);

  try {
    const result = await crawlDate(date, { onlyPk: b.handsos_pk });
    const branch = result.branches[0];
    if (!branch?.ok) {
      return NextResponse.json({ error: `수집 실패: ${branch?.reason || '알 수 없음'}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, date, designers: branch.designers });
  } catch (e) {
    console.error('[performance refresh]', (e as Error).message);
    return NextResponse.json({ error: 'HandSOS 수집 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
  }
}
