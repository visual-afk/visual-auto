import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'interview-audio';
const RETENTION_DAYS = 90;

/**
 * Vercel Cron — 매주 확정된 지 90일 지난 면담 녹음을 삭제한다.
 * 전사문·요약·점수 기록은 영구 보존, 원본 음성만 지운다 (개인정보 최소보관).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const admin = getAdminSupabase();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();

  const { data: rows, error } = await admin
    .from('interviews')
    .select('id, audio_path')
    .eq('status', 'confirmed')
    .is('audio_deleted_at', null)
    .not('audio_path', 'is', null)
    .lt('updated_at', cutoff)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  for (const row of rows ?? []) {
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([row.audio_path!]);
    // 파일이 이미 없어도 기록은 정리한다 (remove는 없는 키에 에러를 내지 않음)
    if (!rmErr) {
      await admin
        .from('interviews')
        .update({ audio_deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      deleted += 1;
    }
  }

  console.log(`[cron cleanup-interview-audio] ${deleted}/${rows?.length ?? 0}건 삭제`);
  return NextResponse.json({ ok: true, deleted, candidates: rows?.length ?? 0 });
}
