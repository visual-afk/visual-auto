'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PenLine, TrendingUp, Users, LayoutGrid, MessageSquare, MapPin, PieChart, Film, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/roles';

type Tab = { href: string; label: string; icon: LucideIcon };

function tabsFor(role: Role): Tab[] {
  if (role === 'hq_admin') {
    return [
      { href: '/overview', label: '현황', icon: LayoutGrid },
      { href: '/performance', label: '대시보드', icon: PieChart },
      { href: '/write', label: '글쓰기', icon: PenLine },
      { href: '/reels', label: '릴스', icon: Film },
      { href: '/members', label: '사람', icon: Users },
    ];
  }
  if (role === 'branch_owner') {
    return [
      { href: '/performance', label: '대시보드', icon: PieChart },
      { href: '/write', label: '글쓰기', icon: PenLine },
      { href: '/reels', label: '릴스', icon: Film },
      { href: '/review', label: '리뷰', icon: MessageSquare },
      { href: '/members', label: '멤버', icon: Users },
    ];
  }
  return [
    { href: '/attendance', label: '출근', icon: MapPin },
    { href: '/write', label: '글쓰기', icon: PenLine },
    { href: '/reels', label: '릴스', icon: Film },
    { href: '/review', label: '리뷰', icon: MessageSquare },
    { href: '/track', label: '성과', icon: TrendingUp },
  ];
}

export default function BottomTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = tabsFor(role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-phone border-t border-line bg-surface/95 backdrop-blur">
      <ul className="flex">
        {tabs.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
                  active ? 'text-brand' : 'text-ink-faint'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
