'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine, BarChart3, Users, LayoutGrid, SquarePen, Building2, Search, MessageSquare, MapPin, PieChart, GraduationCap, Film, FileCog, type LucideIcon } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { roleLabel, type Role } from '@/lib/roles';

type NavItem = { href: string; label: string; icon: LucideIcon };

/** 역할별 메뉴 — 본사는 전사 대시보드, 그 외엔 글쓰기/성과, 관리자는 멤버관리 추가 */
function navFor(role: Role): NavItem[] {
  if (role === 'hq_admin') {
    return [
      { href: '/overview', label: '전체 현황', icon: LayoutGrid },
      { href: '/performance', label: '성과 대시보드', icon: PieChart },
      { href: '/branches', label: '지점 관리', icon: Building2 },
      { href: '/keyword-research', label: '키워드 조사', icon: Search },
      { href: '/prompts', label: '프롬프트 관리', icon: FileCog },
      { href: '/write', label: '글쓰기', icon: PenLine },
      { href: '/reels', label: '릴스', icon: Film },
      { href: '/review', label: '리뷰 답글', icon: MessageSquare },
      { href: '/track', label: '내 글·조회수', icon: BarChart3 },
      { href: '/academy', label: '아카데미', icon: GraduationCap },
      { href: '/attendance', label: '출근 현황', icon: MapPin },
      { href: '/members', label: '지점·사람', icon: Users },
    ];
  }
  const base: NavItem[] = [
    { href: '/write', label: '글쓰기', icon: PenLine },
    { href: '/reels', label: '릴스', icon: Film },
    { href: '/review', label: '리뷰 답글', icon: MessageSquare },
    { href: '/track', label: '내 글·조회수', icon: BarChart3 },
    { href: '/attendance', label: '출근', icon: MapPin },
  ];
  if (role === 'branch_owner') {
    base.unshift({ href: '/performance', label: '성과 대시보드', icon: PieChart });
    base.push({ href: '/members', label: '우리 지점 사람', icon: Users });
  }
  return base;
}

export default function Sidebar({
  displayName,
  branchName,
  role,
}: {
  displayName: string;
  branchName: string | null;
  role: Role;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = navFor(role);

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
          <SquarePen size={18} />
        </span>
        <span className="flex flex-col">
          <span className="text-base font-bold leading-tight">비주얼 블로그</span>
          <span className="mt-0.5 w-fit rounded-md bg-brand-wash px-1.5 py-0.5 text-xs font-bold text-brand">
            {roleLabel[role]}
          </span>
        </span>
      </Link>

      <nav className="flex-1 px-3">
        {nav.map((n) => {
          const active = pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? 'bg-brand-wash text-brand' : 'text-ink-soft hover:bg-canvas'
              }`}
            >
              <Icon size={18} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={logout}
        className="m-3 flex items-center gap-3 rounded-xl border-t border-line px-3 py-3 text-left hover:bg-canvas"
        title="로그아웃"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-wash text-sm font-bold text-brand">
          {displayName.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{displayName}</span>
          <span className="block truncate text-xs text-ink-faint">{branchName ?? '본사'}</span>
        </span>
      </button>
    </aside>
  );
}
