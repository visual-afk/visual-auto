'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/** lucide 최신판엔 브랜드 아이콘이 없어 인스타 글리프는 인라인 SVG로 */
function InstagramIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

/**
 * 인스타그램 계정 연결 카드.
 * - 연결 전: "인스타그램 연결" → OAuth (프로페셔널 계정 필요)
 * - 연결 후: @아이디 표시 + 릴스 조회수 자동 수집(새로고침/자동), 해제
 * - autoSync: 마지막 동기화가 오래됐으면 화면 진입 시 한 번 자동 동기화
 */
export default function InstagramConnect({
  connected,
  username,
  syncedLabel,
  autoSync,
}: {
  connected: boolean;
  username: string | null;
  syncedLabel: string | null;
  autoSync: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const ranAutoSync = useRef(false);

  const igParam = params.get('ig');

  async function sync(silent = false) {
    setSyncing(true);
    if (!silent) setMsg('');
    try {
      const res = await fetch('/api/instagram/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) setMsg(data.error || '동기화에 실패했어요');
      } else {
        setMsg(
          data.updated > 0
            ? `릴스 ${data.updated}개 조회수를 가져왔어요`
            : '가져올 릴스가 없어요. 릴스에 인스타 링크를 등록해두면 자동으로 채워져요.',
        );
        router.refresh();
      }
    } catch {
      if (!silent) setMsg('동기화 중 문제가 생겼어요');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (connected && autoSync && !ranAutoSync.current) {
      ranAutoSync.current = true;
      sync(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, autoSync]);

  async function disconnect() {
    if (!window.confirm('인스타그램 연결을 해제할까요? 릴스 조회수 자동 수집이 멈춰요.')) return;
    await fetch('/api/instagram/disconnect', { method: 'DELETE' });
    router.refresh();
  }

  if (!connected) {
    return (
      <div className="rounded-xl2 border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <InstagramIcon size={20} className="shrink-0 text-brand" />
            <div>
              <p className="text-sm font-bold">인스타그램 연결</p>
              <p className="text-xs text-ink-faint">한 번 연결하면 릴스 조회수·저장수가 자동으로 채워져요</p>
            </div>
          </div>
          <a href="/api/instagram/connect" className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink">
            연결하기
          </a>
        </div>
        {igParam === 'denied' && <p className="mt-2 text-sm text-warn">연결이 취소됐어요. 다시 시도해주세요.</p>}
        {igParam === 'error' && <p className="mt-2 text-sm text-warn">연결에 실패했어요. 인스타 계정이 프로페셔널(비즈니스/크리에이터)인지 확인해주세요.</p>}
        {igParam === 'notready' && <p className="mt-2 text-sm text-warn">인스타 연동 설정이 아직 안 됐어요. 본사에 문의해주세요.</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <InstagramIcon size={20} className="shrink-0 text-brand" />
          <div>
            <p className="text-sm font-bold">@{username} 연결됨</p>
            <p className="text-xs text-ink-faint">{syncedLabel ? `마지막 수집 ${syncedLabel}` : '아직 수집 전'}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => sync()}
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '수집 중…' : '지금 수집'}
          </button>
          <button className="text-xs text-ink-faint underline" onClick={disconnect}>
            해제
          </button>
        </div>
      </div>
      {(msg || igParam === 'connected') && (
        <p className="mt-2 text-sm text-ink-soft">{msg || '인스타그램이 연결됐어요! 릴스 조회수를 자동으로 가져올게요.'}</p>
      )}
    </div>
  );
}
