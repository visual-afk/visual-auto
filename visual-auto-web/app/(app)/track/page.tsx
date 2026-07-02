import Link from 'next/link';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import DraftDeleteButton from '@/components/DraftDeleteButton';

export const dynamic = 'force-dynamic';

const TARGET_LABEL: Record<string, string> = { naver: '네이버', imweb: '아임웹' };

function fmtDate(s: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function isThisMonth(s: string, now: Date) {
  const d = new Date(s);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default async function TrackPage() {
  const member = (await getMember())!;
  const admin = getAdminSupabase();
  const [{ data: posts }, { data: reels }] = await Promise.all([
    admin
      .from('posts')
      .select('id, title, status, publish_target, views, next_check_at, published_at, created_at')
      .eq('author_id', member.userId)
      .order('created_at', { ascending: false }),
    admin
      .from('reels')
      .select('id, views, created_at')
      .eq('author_id', member.userId),
  ]);

  const list = posts || [];
  const reelList = reels || [];
  const now = new Date();
  // 발행한 글만 센다 — 생성만 하고 발행 안 한 초안이 "이번 달 글"로 잡히면 혼란
  const monthCount = list.filter(
    (p) => p.status === 'published' && isThisMonth(p.published_at || p.created_at, now)
  ).length;
  const monthReels = reelList.filter((r) => isThisMonth(r.created_at, now)).length;
  const withViews = [...list, ...reelList].filter((p) => p.views != null);
  const totalViews = withViews.reduce((s, p) => s + (p.views || 0), 0);
  const avgViews = withViews.length ? Math.round(totalViews / withViews.length) : 0;
  const today = now.toISOString().slice(0, 10);

  return (
    <div className="py-6 md:py-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 글·조회수</h1>
        <Link href="/write" className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink">
          + 오늘 글쓰기
        </Link>
      </div>

      {/* 통계 */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="이번 달 글" value={`${monthCount}개`} />
        <Stat label="이번 달 릴스" value={`${monthReels}개`} />
        <Stat label="총 조회수" value={totalViews.toLocaleString()} accent />
        <Stat label="평균 조회수" value={avgViews.toLocaleString()} />
      </div>

      {/* 목록 */}
      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-surface">
        <div className="hidden grid-cols-[1fr_5rem_6rem_4rem] gap-2 border-b border-line px-5 py-3 text-xs font-semibold text-ink-faint md:grid">
          <span>제목</span>
          <span>올린 곳</span>
          <span className="text-right">조회수</span>
          <span className="text-right">올린 날</span>
        </div>
        {list.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">아직 글이 없어요. 첫 글을 써보세요!</p>
        )}
        <ul className="divide-y divide-line">
          {list.map((p) => {
            const due = p.next_check_at && p.next_check_at <= today;
            return (
              <li
                key={p.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 px-5 py-4 md:grid-cols-[1fr_5rem_6rem_4rem]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {p.status !== 'published' && (
                    <span className="shrink-0 rounded-full bg-ink-faint/15 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                      초안
                    </span>
                  )}
                  <Link href={p.status === 'published' ? `/track/${p.id}` : '/write'} className="truncate font-semibold">
                    {p.title || '제목 없음'}
                  </Link>
                </span>
                <span className="hidden text-sm text-ink-soft md:block">
                  {p.publish_target ? TARGET_LABEL[p.publish_target] : '-'}
                </span>
                <span className="text-right text-sm md:col-auto">
                  {p.status !== 'published' ? (
                    <DraftDeleteButton id={p.id} />
                  ) : p.views != null ? (
                    <span className="font-bold text-brand">{p.views.toLocaleString()}</span>
                  ) : (
                    <Link
                      href={`/track/${p.id}`}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        due ? 'border-warn text-warn' : 'border-brand text-brand'
                      }`}
                    >
                      조회수 입력
                    </Link>
                  )}
                </span>
                <span className="hidden text-right text-sm text-ink-faint md:block">
                  {fmtDate(p.published_at || p.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-brand' : ''}`}>{value}</p>
    </div>
  );
}
