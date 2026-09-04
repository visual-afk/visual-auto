import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

const BUCKET = 'reels-video';

/**
 * 레퍼런스 영상 업로드 준비 — 서명 업로드 URL 발급.
 *
 * 영상을 라우트로 프록시하지 않는다(Vercel 바디 ~4.5MB 한계) — 면담 녹음과 동일하게
 * 클라이언트가 이 URL로 스토리지에 직접 올리고, 이어서 /api/reels/analyze/process 를 부른다.
 */
export async function POST() {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '영상 분석은 Gemini 설정이 필요해요. 관리자에게 문의해주세요.' }, { status: 503 });
  }

  // 경로 접두어를 branchId(없으면 userId)로 고정 → process 단계에서 소유권 검증에 씀
  const owner = member.branchId ?? member.userId;
  const path = `${owner}/${crypto.randomUUID()}.mp4`;

  const admin = getAdminSupabase();
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !signed) {
    console.error('[reels analyze] signed url', error?.message);
    return NextResponse.json({ error: '업로드 준비에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
  }

  return NextResponse.json({ upload: { path, token: signed.token, signedUrl: signed.signedUrl } });
}
