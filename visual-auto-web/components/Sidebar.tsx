'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SquarePen, ChevronDown, ChevronRight } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { roleLabel, type Role } from '@/lib/roles';
import { foldersFor, DEFAULT_OPEN } from '@/lib/nav';

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
  const folders = foldersFor(role);

  // 초기 펼침: 역할 기본 폴더 + 현재 경로가 속한 폴더
  const [open, setOpen] = useState<Set<string>>(() => {
    const init = new Set<string>([DEFAULT_OPEN[role]]);
    const active = folders.find((f) => f.items.some((i) => pathname.startsWith(i.href)));
    if (active) init.add(active.key);
    return init;
  });

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

      <nav className="flex-1 overflow-y-auto px-3">
        {folders.map((folder) => {
          const isOpen = open.has(folder.key);
          return (
            <div key={folder.key} className="mb-1">
              <button
                onClick={() => toggle(folder.key)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-faint transition hover:text-ink-soft"
              >
                {folder.label}
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {isOpen && (
                <div className="mt-0.5">
                  {folder.items.map((n) => {
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
                </div>
              )}
            </div>
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
