import Link from 'next/link';
import { Suspense } from 'react';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import InstagramConnect from '@/components/InstagramConnect';
import StatsOcrUpload from '@/components/StatsOcrUpload';
import DraftDeleteButton from '@/components/DraftDeleteButton';

export const dynamic = 'force-dynamic';

type Scope = 'own' | 'branch' | 'all';

/** 올린 곳 라벨 — 양쪽에 올렸으면 "아임웹·네이버" */
function targetLabel(p: { posted_imweb?: boolean; posted_naver?: boolean }): string {
  const t: string[] = [];
  if (p.posted_imweb) t.push('아임웹');
  if (p.posted_naver) t.push('네이버');
  return t.length ? t.join('·') : '-';
}

function fmtDate(s: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function isThisMonth(s: string, now: Date) {
  const d = new Date(s);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const member = (await getMember())!;
  const admin = getAdminSupabase();

  // 스코프: 내 글(기본) / 우리 지점(원장) / 전체 지점(본사). 권한 밖이면 own으로 강등.
  const sp = await searchParams;
  const canBranch = member.role === 'branch_owner' && member.branchIds.length > 0;
  const canAll = member.role === 'hq_admin';
  let scope: Scope = 'own';
  if (sp.scope === 'branch' && canBranch) scope = 'branch';
  else if (sp.scope === 'all' && canAll) scope = 'all';

  let postsQ = admin
    .from('posts')
    .select(
      'id, title, status, posted_imweb, posted_naver, views, next_check_at, published_at, created_at, author_id, branch_id'
    )
    .order('created_at', { ascending: false });
  let reelsQ = admin.from('reels').select('id, views, created_at, author_id, branch_id');
  if (scope === 'own') {
    postsQ = postsQ.eq('author_id', member.userId);
    reelsQ = reelsQ.eq('author_id', member.userId);
  } else if (scope === 'branch') {
    postsQ = postsQ.in('branch_id', member.branchIds);
    reelsQ = reelsQ.in('branch_id', member.branchIds);
  } // all → 필터 없음 (본사 전 지점)

  const [{ data: posts }, { data: reels }, { data: igAccount }] = await Promise.all([
    postsQ,
    reelsQ,
    admin
      .from('instagram_accounts')
      .select('username, last_synced_at')
      .eq('user_id', member.userId)
      .maybeSingle(),
  ]);

  // 합산 스코프에선 작성자·지점 이름을 같이 보여준다
  const authorNames = new Map<string, string>();
  const branchNames = new Map<string, string>();
  if (scope !== 'own') {
    const [{ data: us }, { data: bs }] = await Promise.all([
      admin.from('branch_users').select('user_id, display_name'),
      admin.from('branches').select('id, name'),
    ]);
    for (const u of us ?? []) if (u.user_id) authorNames.set(u.user_id, u.display_name ?? '');
    for (const b of bs ?? []) branchNames.set(b.id, b.name);
  }

  // 인스타 연결 상태 (하이드레이션 안전: 날짜 라벨은 서버에서 KST로 1회 포맷)
  const igSyncedAt = igAccount?.last_synced_at ?? null;
  const igSyncedLabel = igSyncedAt
    ? new Date(igSyncedAt).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      })
    : null;
  const igAutoSync = !!igAccount && (!igSyncedAt || Date.now() - new Date(igSyncedAt).getTime() > 12 * 3600_000);

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

  const scopeOptions: { key: Scope; label: string; href: string }[] = [
    { key: 'own', label: '내 글', href: '/track' },
  ];
  if (canBranch) scopeOptions.push({ key: 'branch', label: '우리 지점', href: '/track?scope=branch' });
  if (canAll) scopeOptions.push({ key: 'all', label: '전체 지점', href: '/track?scope=all' });

  const heading = scope === 'all' ? '전체 글·조회수' : scope === 'branch' ? '지점 글·조회수' : '내 글·조회수';
  const emptyText = scope === 'own' ? '아직 글이 없어요. 첫 글을 써보세요!' : '아직 올라온 글이 없어요.';

  return (
    <div className="py-6 md:py-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{heading}</h1>
        <Link href="/write" className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink">
          + 오늘 글쓰기
        </Link>
      </div>

      {/* 스코프 전환 (원장·본사만 노출) */}
      {scopeOptions.length > 1 && (
        <div className="mt-4 inline-flex rounded-2xl border border-line bg-surface p-1">
          {scopeOptions.map((o) => (
            <Link
              key={o.key}
              href={o.href}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold ${
                scope === o.key ? 'bg-brand text-brand-ink' : 'text-ink-soft'
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      )}

      {/* 자동 수집: 인스타 연결 + 블로그 통계 스크린샷 */}
      <div className="mt-6 space-y-3">
        <Suspense>
          <InstagramConnect
            connected={!!igAccount}
            username={igAccount?.username ?? null}
            syncedLabel={igSyncedLabel}
            autoSync={igAutoSync}
          />
        </Suspense>
        <StatsOcrUpload mode="blog" />
      </div>

      {/* 통계 */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={scope === 'own' ? '이번 달 글' : '이번 달 글(전원)'} value={`${monthCount}개`} />
        <Stat label="이번 달 릴스" value={`${monthReels}개`} />
        <Stat label="총 조회수" value={totalViews.toLocaleString()} accent />
        <Stat label="평균 조회수" value={avgViews.toLocaleString()} />
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        조회수는 자동으로 안 올라가요 — 글을 눌러 직접 입력하거나, 위 &quot;블로그 통계 스크린샷&quot;을 올리면 반영돼요.
      </p>

      {/* 목록 */}
      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-surface">
        <div className="hidden grid-cols-[1fr_5rem_6rem_4rem] gap-2 border-b border-line px-5 py-3 text-xs font-semibold text-ink-faint md:grid">
          <span>제목</span>
          <span>올린 곳</span>
          <span className="text-right">조회수</span>
          <span className="text-right">올린 날</span>
        </div>
        {list.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">{emptyText}</p>
        )}
        <ul className="divide-y divide-line">
          {list.map((p) => {
            const due = p.next_check_at && p.next_check_at <= today;
            const byline =
              scope !== 'own'
                ? [authorNames.get(p.author_id), scope === 'all' ? branchNames.get(p.branch_id) : null]
                    .filter(Boolean)
                    .join(' · ')
                : null;
            return (
              <li
                key={p.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 px-5 py-4 md:grid-cols-[1fr_5rem_6rem_4rem]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.status !== 'published' && (
                      <span className="shrink-0 rounded-full bg-ink-faint/15 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        초안
                      </span>
                    )}
                    {p.status === 'published' ? (
                      <Link href={`/track/${p.id}`} className="truncate font-semibold">
                        {p.title || '제목 없음'}
                      </Link>
                    ) : scope === 'own' ? (
                      <Link href="/write" className="truncate font-semibold">
                        {p.title || '제목 없음'}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold">{p.title || '제목 없음'}</span>
                    )}
                  </span>
                  {byline && <span className="mt-0.5 truncate text-xs text-ink-faint">{byline}</span>}
                </span>
                <span className="hidden text-sm text-ink-soft md:block">{targetLabel(p)}</span>
                <span className="text-right text-sm md:col-auto">
                  {p.status !== 'published' ? (
                    scope === 'own' ? (
                      <DraftDeleteButton id={p.id} />
                    ) : (
                      <span className="text-ink-faint">–</span>
                    )
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
