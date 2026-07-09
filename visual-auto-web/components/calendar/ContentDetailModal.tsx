'use client';

import Link from 'next/link';
import { X, PenLine, Film, ExternalLink, BarChart3 } from 'lucide-react';
import type { PublishedItem } from '@/lib/contentCalendar';

/** 발행 콘텐츠 상세 팝업 — 작성자·조회수·날짜·지점 + 글로 이동 링크 */
export default function ContentDetailModal({ item, onClose }: { item: PublishedItem; onClose: () => void }) {
  const Icon = item.kind === 'post' ? PenLine : Film;
  const [, m, d] = item.date.split('-');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 md:items-center md:p-6" onClick={onClose}>
      <div
        className="w-full max-w-phone rounded-t-xl2 bg-surface p-5 shadow-card md:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand">
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold">{item.title}</h3>
              <p className="text-xs text-ink-faint">
                {item.kind === 'post' ? '블로그' : '릴스'} · {item.branchName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-canvas">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-[11px] text-ink-faint">작성자</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{item.authorName ?? '작성자 미상'}</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-[11px] text-ink-faint">조회수</p>
            <p className="mt-0.5 text-sm font-semibold text-brand">
              {item.views != null ? item.views.toLocaleString() : '미기록'}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-[11px] text-ink-faint">발행일</p>
            <p className="mt-0.5 text-sm font-semibold">
              {Number(m)}.{Number(d)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {item.kind === 'post' && (
            <Link
              href={`/track/${item.id}`}
              className="flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink"
            >
              <BarChart3 size={15} /> 글 관리 화면
            </Link>
          )}
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
            >
              <ExternalLink size={15} /> 발행된 글 보기
            </a>
          ) : (
            <span className="flex items-center rounded-2xl border border-line bg-canvas px-4 py-2.5 text-sm text-ink-faint">
              발행 링크 미기록
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
