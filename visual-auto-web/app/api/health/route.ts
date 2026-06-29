import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 진단용: 함수 리전 + Supabase 왕복 지연 측정 (/api/health) */
export async function GET() {
  const admin = getAdminSupabase();
  const t0 = Date.now();
  await admin.from('branches').select('id', { count: 'exact', head: true });
  const dbMs = Date.now() - t0;
  return NextResponse.json({
    ok: true,
    functionRegion: process.env.VERCEL_REGION || 'local',
    supabaseRoundTripMs: dbMs,
  });
}
