import { NextResponse } from 'next/server';
import { requireMember, canManage } from '@/lib/auth';
import { extendAllBrands } from '@/lib/cardnews/topic-seed';

export const maxDuration = 60;

/**
 * "지금 다시 편성" — 크론을 기다리지 않고 즉시 시드.
 * 전체 삭제 후 새 은행으로 처음부터 다시 짤 때 쓴다 (오늘이 새 앵커가 됨).
 */
export async function POST() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  if (!canManage(res.member.role)) {
    return NextResponse.json({ error: '원장·본사만 편성을 실행할 수 있어요' }, { status: 403 });
  }

  try {
    const result = await extendAllBrands();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
