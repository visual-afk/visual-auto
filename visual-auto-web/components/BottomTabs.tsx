'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  PenLine,
  Users,
  LayoutGrid,
  MessageSquare,
  MapPin,
  PieChart,
  Film,
  Menu,
  X,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { roleLabel, type Role } from '@/lib/roles';
import { foldersFor } from '@/lib/nav';

type Tab = { href: string; label: string; icon: LucideIcon };

/** 하단바 기본 4탭(역할별 자주 쓰는 것). 나머지 전 화면은 "메뉴" 시트로 접근. */
function primaryTabs(role: Role): Tab[] {
  if (role === 'hq_admin') {
    return [
      { href: '/performance', label: '현황', icon: LayoutGrid },
      { href: '/write', label: '글쓰기', icon: PenLine },
      { href: '/reels', label: '릴스', icon: Film },
      { href: '/review', label: '리뷰', icon: MessageSquare },
    ];
  }
  if (role === 'branch_owner') {
    return [
      { href: '/performance', label: '대시보드', icon: PieChart },
      { href: '/write', label: '글쓰기', icon: PenLine },
      { href: '/reels', label: '릴스', icon: Film },
      { href: '/review', label: '리뷰', icon: MessageSquare },
    ];
  }
  return [
    { href: '/write', label: '글쓰기', icon: PenLine },
    { href: '/reels', label: '릴스', icon: Film },
    { href: '/review', label: '리뷰', icon: MessageSquare },
    { href: '/attendance', label: '출근', icon: MapPin },
  ];
}

export default function BottomTabs({
  role,
  displayName,
  branchName,
}: {
  role: Role;
  displayName: string;
  branchName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = primaryTabs(role);
  const folders = foldersFor(role);

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {/* 전체 메뉴 시트 */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-base font-bold">전체 메뉴</span>
              <button onClick={() => setMenuOpen(false)} className="text-ink-soft" aria-label="닫기">
                <X size={22} />
              </button>
            </div>

            {folders.map((folder) => (
              <div key={folder.key} className="mb-3">
                <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{folder.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {folder.items.map((n) => {
                    const active = pathname.startsWith(n.href);
                    const Icon = n.icon;
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2.5 rounded-xl2 border px-3 py-3 text-sm font-semibold transition ${
                          active ? 'border-brand bg-brand-wash text-brand' : 'border-line bg-canvas text-ink-soft'
                        }`}
                      >
                        <Icon size={18} />
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={logout}
              className="mt-2 flex w-full items-center gap-3 rounded-xl2 border border-line px-3 py-3 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-wash text-sm font-bold text-brand">
                {displayName.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{displayName}</span>
                <span className="block truncate text-xs text-ink-faint">
                  {branchName ?? '본사'} · {roleLabel[role]}
                </span>
              </span>
              <LogOut size={18} className="text-ink-faint" />
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-phone border-t border-line bg-surface/95 backdrop-blur">
        <ul className="flex">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
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
          <li className="flex-1">
            <button
              onClick={() => setMenuOpen(true)}
              className={`flex w-full flex-col items-center gap-1 py-3 text-xs font-medium ${
                menuOpen ? 'text-brand' : 'text-ink-faint'
              }`}
            >
              <Menu size={20} strokeWidth={2} />
              메뉴
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
