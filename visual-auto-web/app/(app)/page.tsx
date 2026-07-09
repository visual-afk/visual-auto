import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PenLine, Film, Bell, ChevronRight } from 'lucide-react';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isThisMonth(s: string, now: Date) {
  const d = new Date(s);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default async function HomePage() {
  const member = (await getMember())!;
  if (member.role === 'hq_admin') redirect('/performance'); // 본사는 회사 현황으로

  const admin = getAdminSupabase();
  const [{ data: posts }, { data: reels }] = await Promise.all([
    admin.from('posts').select('views, status, published_at, created_at').eq('author_id', member.userId),
    admin.from('reels').select('views, created_at').eq('author_id', member.userId),
  ]);

  const list = posts ?? [];
  const reelList = reels ?? [];
  const now = new Date();
  // 발행한 글만 센다 — 생성만 하고 발행 안 한 초안이 "글 1"로 잡히면 혼란
  const monthPosts = list.filter(
    (p) => p.status === 'published' && isThisMonth(p.published_at || p.created_at, now)
  ).length;
  const monthReels = reelList.filter((r) => isThisMonth(r.created_at, now)).length;
  const totalViews = [...list, ...reelList].reduce((s, p) => s + (p.views || 0), 0);

  // 소스 없는 값은 목업 — 추후 시트/리뷰 테이블 연동 예정
  const recommendedTopic = '써마지급 결관리';
  const pendingReviews = 2;

  return (
    <div className="py-6 md:py-0">
      {/* 헤더 */}
      <h1 className="text-2xl font-bold">오늘 이거 3개만요</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {member.displayName} 디자이너님 · {member.branchName}
        {member.region ? ` · ${member.region}` : ''}
      </p>

      {/* 오늘 할 일 3개 */}
      <div className="mt-6 space-y-3">
        <TaskCard
          href="/write"
          icon={<PenLine size={18} />}
          title="블로그 쓰기"
          sub={`추천 주제: ${recommendedTopic}`}
        />
        <TaskCard
          href="/reels"
          icon={<Film size={18} />}
          title="릴스 1개 만들기"
          sub="레퍼런스 골라서 5분이면 돼요"
        />
        <TaskCard
          href="/review"
          icon={<Bell size={18} />}
          title={`새 리뷰 답글 ${pendingReviews}개`}
          sub="답글 기다리는 리뷰가 있어요"
          highlight
        />
      </div>

      {/* 이번 달 요약 */}
      <div className="mt-6 rounded-xl2 border border-line bg-surface px-5 py-4 text-center text-sm font-semibold text-ink-soft">
        내 이번 달 · 글 {monthPosts} · 릴스 {monthReels} · 조회 {totalViews.toLocaleString()}
      </div>
    </div>
  );
}

function TaskCard({
  href,
  icon,
  title,
  sub,
  highlight,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl2 border px-4 py-4 shadow-card transition active:scale-[0.99] ${
        highlight ? 'border-brand bg-brand-wash' : 'border-line bg-surface'
      }`}
    >
      {highlight ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink">
          {icon}
        </span>
      ) : (
        <span className="h-6 w-6 shrink-0 rounded-full border-2 border-line" />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${highlight ? 'text-brand' : ''}`}>{title}</span>
        <span className="mt-0.5 block truncate text-sm text-ink-soft">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-faint" />
    </Link>
  );
}
