import { NextResponse } from 'next/server';
import { requireMember, canActOnBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { loadFileSafeFor } from '@/lib/generation/ai-client';
import { generateCardPhoto } from '@/lib/generation/image-gen';
import { canMakeCardNews } from '@/lib/flags';
import type { InfoCard } from '@/lib/cardnews/cards';

export const maxDuration = 60;

const BUCKET = 'post-photos';

/** 브랜드 사진 톤 파일이 없을 때 쓰는 기본값 */
const DEFAULT_STYLE = [
  '- 실사 사진. 일러스트·CG 금지.',
  '- 자연광, 얕은 심도, 채도 낮은 담백한 톤.',
  '- 이미지 안에 글자·로고·워터마크를 넣지 않는다.',
  '- 광고 컷 느낌 금지.',
].join('\n');

/**
 * 카드 사진 AI 생성 — 스튜디오의 "AI 생성" 버튼.
 * 카드의 사진 지시문(photo_hint)을 브랜드 사진 톤과 합쳐 이미지를 만들고
 * post-photos 버킷에 올린 뒤 경로·URL을 돌려준다. (카드 저장은 클라이언트가 한다)
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const body = await request.json().catch(() => ({}));
  const cardNewsId: string = (body.card_news_id || '').trim();
  const idx = Number(body.idx);
  if (!cardNewsId || !Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: '어떤 카드의 사진인지 알 수 없어요' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('card_news')
    .select('id, branch_id, cards, branches(name)')
    .eq('id', cardNewsId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '카드뉴스를 찾지 못했어요' }, { status: 404 });
  if (!canActOnBranch(member, row.branch_id)) {
    return NextResponse.json({ error: '이 카드뉴스에 접근할 수 없어요' }, { status: 403 });
  }
  if (!canMakeCardNews(member.role, 'info')) {
    return NextResponse.json({ error: '카드뉴스는 지금 본사만 만들 수 있어요' }, { status: 403 });
  }

  const cards = (row.cards ?? []) as InfoCard[];
  const card = cards[idx];
  // 편집 중인 지시문이 우선 (저장 전에도 생성할 수 있게)
  const hint = String(body.hint ?? '').trim() || card?.photo_hint?.trim() || card?.title?.trim() || '';
  if (!hint) {
    return NextResponse.json({ error: '어떤 사진을 만들지 적어주세요 (사진 지시문)' }, { status: 400 });
  }

  const branchName = (row.branches as unknown as { name: string } | null)?.name ?? '';
  const style = (await loadFileSafeFor(`knowledge/cardnews/photo-style-${branchName}.md`, row.branch_id)) || DEFAULT_STYLE;

  const prompt = [
    '인스타 카드뉴스 배경으로 쓸 사진 1장을 만든다. 세로 4:5.',
    '',
    `## 담아야 할 장면\n${hint}`,
    '',
    `## 사진 톤 규칙 (반드시 지킬 것)\n${style}`,
    '',
    '이 사진 위에는 나중에 큰 글자가 얹힌다. 화면 아래쪽 1/3은 비교적 단순하게 두어 글자가 읽히게 한다.',
  ].join('\n');

  try {
    const image = await generateCardPhoto(prompt);
    const ext = image.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const key = `cardnews/${cardNewsId}/${idx}-${Date.now()}.${ext}`;
    const buf = Buffer.from(image.base64, 'base64');

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(key, buf, { contentType: image.mimeType, upsert: false });
    if (upErr) {
      console.error('[generate-photo] upload', upErr.message);
      return NextResponse.json({ error: '만든 사진을 저장하지 못했어요. 다시 시도해 주세요.' }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
    return NextResponse.json({ storage_path: key, url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
