import { redirect } from 'next/navigation';
import { getMember, canActOnBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFrameFor } from '@/lib/cardnews/frames';
import CardNewsStudio from '@/components/cardnews/CardNewsStudio';
import type { CardNews, ImageCard, InfoCard } from '@/lib/cardnews/cards';

export const dynamic = 'force-dynamic';

export default async function CardNewsEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const member = (await getMember())!;
  const { id } = await params;

  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('card_news')
    .select('*, branches(name)')
    .eq('id', id)
    .maybeSingle();
  if (!row) redirect('/card-news');
  if (row.author_id !== member.userId && !canActOnBranch(member, row.branch_id)) redirect('/card-news');

  const branchName = (row.branches as unknown as { name: string } | null)?.name ?? '';
  const frame = await getFrameFor(row.branch_id);

  // 카드 사진의 공개 URL 맵 (getPublicUrl은 네트워크 호출 없음).
  // 이미지형 슬라이드 + 정보형 사진 표지(coverStyle: photo) 둘 다 photo_path 를 쓴다.
  const photoUrls: Record<string, string> = {};
  for (const card of (row.cards ?? []) as (ImageCard | InfoCard)[]) {
    const path = card.photo_path;
    if (path && !photoUrls[path]) {
      photoUrls[path] = admin.storage.from('post-photos').getPublicUrl(path).data.publicUrl;
    }
  }

  // 캘린더 편성 주제로 만든 초안이면 스튜디오에서 "다시 뽑기"를 쓸 수 있다
  const { data: linkedTopic } = await admin
    .from('cardnews_topics')
    .select('id')
    .eq('card_news_id', id)
    .maybeSingle();

  return (
    <CardNewsStudio
      initial={row as unknown as CardNews}
      frame={frame}
      branchName={branchName}
      photoUrls={photoUrls}
      topicLinked={!!linkedTopic}
    />
  );
}
