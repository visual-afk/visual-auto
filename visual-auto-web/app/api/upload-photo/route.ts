import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

// 글쓰기 사진 업로드 — post-photos 버킷 (공개).
// 기기 다운로드만 하던 사진을 서버에 보관해 카드뉴스(이미지형)가 가져다 쓸 수 있게 한다.
const BUCKET = 'post-photos';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const form = await request.formData().catch(() => null);
  const photo = form?.get('photo');
  const slot = Number(form?.get('slot') ?? 0) || 0;
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: '사진 파일을 첨부해주세요' }, { status: 422 });
  }
  if (!photo.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요' }, { status: 422 });
  }
  if (photo.size > MAX_SIZE) {
    return NextResponse.json({ error: '사진이 너무 커요 (10MB 이하)' }, { status: 413 });
  }

  const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `posts/${member.userId}/${Date.now()}-${slot}.${ext}`;
  const buf = Buffer.from(await photo.arrayBuffer());

  const admin = getAdminSupabase();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(key, buf, { contentType: photo.type || 'image/jpeg', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: '사진 업로드에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
  return NextResponse.json({ slot, storage_path: key, url: pub.publicUrl });
}
