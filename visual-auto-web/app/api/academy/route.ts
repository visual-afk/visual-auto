import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { parseMarketingWorkbook } from '@/lib/academy';

export const maxDuration = 60;

/** 아카데미 마케팅 엑셀 업로드 → marketing_daily upsert. 본사 전용. */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;
  if (member.role !== 'hq_admin') {
    return NextResponse.json({ error: '본사 계정만 업로드할 수 있어요' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '엑셀 파일을 올려주세요' }, { status: 400 });
  }

  let rows;
  try {
    rows = parseMarketingWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error('[academy parse]', (e as Error).message);
    return NextResponse.json({ error: '엑셀을 읽지 못했어요. 형식을 확인해주세요.' }, { status: 400 });
  }
  if (!rows.length) {
    return NextResponse.json({ error: '읽을 수 있는 행이 없어요 ("유입채널" 컬럼 + 날짜 필요)' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  // 청크 upsert
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from('marketing_daily').upsert(chunk, { onConflict: 'date,channel' });
    if (error) {
      console.error('[academy upsert]', error.message);
      return NextResponse.json({ error: '저장 중 문제가 생겼어요' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, rows: rows.length, filename: file.name });
}
