import Link from 'next/link';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MODE_LABEL: Record<string, string> = { info: '정보형', image: '이미지형' };

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 내 카드뉴스 목록 — 새 카드뉴스는 글쓰기 초안에서 "카드뉴스로"로 만든다. */
export default async function CardNewsListPage() {
  const member = (await getMember())!;
  const admin = getAdminSupabase();
  const { data } = await admin
    .from('card_news')
    .select('id, mode, card_count, status, views, created_at, branches(name), posts(title)')
    .eq('author_id', member.userId)
    .order('created_at', { ascending: false });
  const list = data ?? [];

  return (
    <div className="py-6 md:py-0">
      <h1 className="mb-1 text-2xl font-bold">카드뉴스</h1>
      <p className="mb-6 text-sm text-ink-soft">쓴 글에서 뽑은 인스타 카드예요. 새로 만들려면 글쓰기 초안에서 "카드뉴스로"를 눌러요.</p>

      {list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-faint">
          아직 카드뉴스가 없어요.
          <br />
          <Link href="/write" className="mt-2 inline-block font-semibold text-brand">
            글 쓰고 카드뉴스 만들기 →
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {list.map((c) => {
          const post = c.posts as unknown as { title: string | null } | null;
          const branch = c.branches as unknown as { name: string } | null;
          return (
            <li key={c.id}>
              <Link href={`/card-news/${c.id}`} className="block rounded-2xl border border-line bg-surface px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">{post?.title || '제목 없음'}</span>
                  <span className="shrink-0 rounded-full bg-brand-wash px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                    {MODE_LABEL[c.mode] ?? c.mode}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {branch?.name} · {c.card_count}장 · {c.status === 'published' ? (c.views != null ? `조회 ${c.views.toLocaleString()}` : '추적 중') : '초안'} · {fmtDate(c.created_at)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
