import Link from 'next/link';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { canMakeCardNews } from '@/lib/flags';
import { kstTodayStr } from '@/lib/kst';
import NewFromTopic, { type TopicPick } from '@/components/cardnews/NewFromTopic';

/** KST 오늘 기준 days만큼 이동한 YYYY-MM-DD */
function shiftDate(todayStr: string, days: number): string {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
    .select('id, mode, card_count, status, views, created_at, cards, branches(name), posts(title)')
    .eq('author_id', member.userId)
    .order('created_at', { ascending: false });
  const list = data ?? [];

  // 주제로 만들기: 본사(또는 정보형 개방 플래그)만. 브랜드 계정 목록을 넘긴다.
  const canCreate = canMakeCardNews(member.role, 'info');
  const brands = canCreate
    ? ((await admin.from('branches').select('id, name').eq('kind', 'brand').order('name')).data ?? [])
    : [];

  // 콘텐츠 캘린더 편성 주제(지난 7일~앞으로 14일) — 여기서 골라 바로 만들 수 있게.
  const today = kstTodayStr();
  let topics: TopicPick[] = [];
  if (canCreate) {
    let q = admin
      .from('cardnews_topics')
      .select('id, branch_id, topic_date, material, headline_draft, status, card_news_id, verify_needed, fact_confirmed, branches(name)')
      .gte('topic_date', shiftDate(today, -7))
      .lte('topic_date', shiftDate(today, 14))
      .neq('status', 'skipped')
      .order('topic_date');
    if (member.role !== 'hq_admin') q = q.in('branch_id', member.branchIds);
    const { data: topicRows } = await q;
    topics = (topicRows ?? []).map((t) => ({
      id: t.id,
      branch_id: t.branch_id,
      topic_date: t.topic_date,
      material: t.material,
      headline_draft: t.headline_draft,
      status: t.status,
      card_news_id: t.card_news_id,
      verify_needed: t.verify_needed,
      fact_confirmed: t.fact_confirmed,
      branchName: (t.branches as unknown as { name: string } | null)?.name ?? '',
    }));
  }

  return (
    <div className="py-6 md:py-0">
      <h1 className="mb-1 text-2xl font-bold">카드뉴스</h1>
      <p className="mb-6 text-sm text-ink-soft">쓴 글에서 뽑거나, 브랜드 주제로 바로 만드는 인스타 카드예요.</p>

      {canCreate && (
        <p className="mb-3 text-xs text-ink-faint">
          매일 편성되는 브랜드 주제는{' '}
          <Link href="/calendar" className="font-semibold text-brand">
            콘텐츠 캘린더
          </Link>
          의 초록 칩에서 바로 만들 수 있어요.
        </p>
      )}
      {canCreate && <NewFromTopic brands={brands} topics={topics} today={today} />}

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
          // 주제 기반 카드는 원본 글이 없으니 표지 훅을 제목처럼 보여준다.
          const cardsArr = (Array.isArray(c.cards) ? c.cards : []) as { kind?: string; title?: string }[];
          const cover = cardsArr.find((x) => x.kind === 'cover') ?? cardsArr[0];
          const title = post?.title || cover?.title || '제목 없음';
          return (
            <li key={c.id}>
              <Link href={`/card-news/${c.id}`} className="block rounded-2xl border border-line bg-surface px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">{title}</span>
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
