import { redirect } from 'next/navigation';
import { getMember, canActOnBranch } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFrameFor } from '@/lib/cardnews/frames';
import CardNewsStudio from '@/components/cardnews/CardNewsStudio';
import type { CardNews, ImageCard } from '@/lib/cardnews/cards';

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

  // 이미지형: 카드 사진의 공개 URL 맵 (getPublicUrl은 네트워크 호출 없음)
  const photoUrls: Record<string, string> = {};
  if (row.mode === 'image') {
    for (const card of (row.cards ?? []) as ImageCard[]) {
      if (card.photo_path && !photoUrls[card.photo_path]) {
        photoUrls[card.photo_path] = admin.storage.from('post-photos').getPublicUrl(card.photo_path).data.publicUrl;
      }
    }
  }

  return (
    <CardNewsStudio
      initial={row as unknown as CardNews}
      frame={frame}
      branchName={branchName}
      photoUrls={photoUrls}
    />
  );
}
