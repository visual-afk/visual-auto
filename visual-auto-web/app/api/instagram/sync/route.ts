import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { igSyncUser } from '@/lib/instagram';

export const maxDuration = 60;

/** 내 인스타 릴스 조회수·저장수 동기화 */
export async function POST() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  try {
    const result = await igSyncUser(member.userId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[instagram] sync failed:', msg);
    if (/연결되어 있지/.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json(
      { error: '인스타 데이터를 가져오지 못했어요. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }
}
