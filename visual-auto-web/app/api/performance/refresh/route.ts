import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch, isMultiBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { crawlDate } from '@/lib/handsos/crawl';
import { syncProductSheet } from '@/lib/product-sheet/sync';
import { isProductSheetConfigured } from '@/lib/product-sheet/config';
import { kstYesterdayStr } from '@/lib/kst';

export const maxDuration = 300;

/**
 * 실패 사유 문구.
 * - 접속 자체가 막힌 경우(HandSOS가 서버 IP를 차단): 다시 눌러도 안 되므로 그렇게 말해준다.
 * - 본사(hq_admin)에겐 진짜 원인을 그대로 붙인다 — 모두에게 같은 뭉뚱그린 문구를 주면
 *   장애가 나도 아무도 원인을 못 찾는다(이번에 5주가 그렇게 갔다).
 */
function crawlErrorMessage(e: unknown, isHq: boolean): string {
  const raw = (e as Error).message;
  const blocked = raw.startsWith('HandSOS 접속 실패');
  const base = blocked
    ? '지금은 서버에서 바로 수집할 수 없어요. 성과는 매일 아침 자동 수집으로 채워집니다.'
    : 'HandSOS 수집 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.';
  return isHq ? `${base}\n(사유: ${raw})` : base;
}

/** 대시보드 [새로고침] — 선택 지점의 어제치만 빠르게 크롤→upsert. 원장(자기지점)/본사. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role === 'designer' || member.role === 'intern') {
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  let branchId: string | null;
  if (isMultiBranch(member)) {
    branchId = body.branch_id || member.branchId;
    if (!branchId) return NextResponse.json({ error: '지점을 골라주세요' }, { status: 400 });
    if (!canActOnBranch(member, branchId)) {
      return NextResponse.json({ error: '내 지점만 새로고침할 수 있어요' }, { status: 403 });
    }
  } else {
    branchId = member.branchId;
  }
  if (!branchId) return NextResponse.json({ error: '지점을 골라주세요' }, { status: 400 });

  const { data: b } = await getAdminSupabase()
    .from('branches')
    .select('name, handsos_pk, kind')
    .eq('id', branchId)
    .maybeSingle();

  // 브랜드는 본사 전용 새로고침
  if (b?.kind === 'brand') {
    if (member.role !== 'hq_admin') {
      return NextResponse.json({ error: '권한이 없어요' }, { status: 403 });
    }

    // 비주얼살롱(전지점 합산 뷰): 전 지점 어제치 HandSOS 크롤 (지점 총합만)
    if (b.name === '비주얼살롱') {
      const date = kstYesterdayStr();
      try {
        const result = await crawlDate(date, { skipDesigners: true, sleepBranches: 500 });
        const okCount = result.branches.filter((br) => br.ok).length;
        return NextResponse.json({ ok: true, date, designers: 0, branches: okCount });
      } catch (e) {
        console.error('[performance refresh:all-salon]', (e as Error).message);
        return NextResponse.json({ error: crawlErrorMessage(e, true) }, { status: 500 });
      }
    }

    // 제품 브랜드(누혜/트리필드/아카데미): HandSOS가 아니라 구글시트 동기화
    if (!isProductSheetConfigured()) {
      return NextResponse.json({ error: '제품 시트 연동 설정(PRODUCT_SHEET_ID)이 안 됐어요' }, { status: 400 });
    }
    try {
      const s = await syncProductSheet();
      return NextResponse.json({ ok: true, salesRows: s.salesRows, products: s.products });
    } catch (e) {
      console.error('[performance refresh:brand]', (e as Error).message);
      return NextResponse.json({ error: '구글시트 동기화 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.' }, { status: 500 });
    }
  }

  if (!b?.handsos_pk) {
    return NextResponse.json({ error: '이 지점은 아직 HandSOS 연동이 안 됐어요' }, { status: 400 });
  }

  const date = kstYesterdayStr();

  try {
    // 빠른 모드: 지점 총합만 크롤(디자이너 생략) → Vercel 타임아웃 회피. 디자이너 세부는 야간 cron이 채움.
    const result = await crawlDate(date, { onlyPk: b.handsos_pk, skipDesigners: true });
    const branch = result.branches[0];
    if (!branch?.ok) {
      return NextResponse.json({ error: `수집 실패: ${branch?.reason || '알 수 없음'}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, date, designers: branch.designers });
  } catch (e) {
    console.error('[performance refresh]', (e as Error).message);
    return NextResponse.json({ error: crawlErrorMessage(e, member.role === 'hq_admin') }, { status: 500 });
  }
}
