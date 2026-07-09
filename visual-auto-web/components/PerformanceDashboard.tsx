'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, TrendingUp, TrendingDown, Wrench, Eye, CalendarCheck, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BranchDashboard, PeriodType } from '@/lib/metrics';

export type BranchOpt = { id: string; name: string; hasSource: boolean };

const won = (n: number) => `${Math.round(n / 10000).toLocaleString()}만원`;
const pctText = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);

function Delta({ v }: { v: number | null }) {
  if (v == null) return null;
  const up = v >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? 'text-ok' : 'text-warn'}`}>
      <Icon size={12} />
      {Math.abs(Math.round(v * 100))}%
    </span>
  );
}

export default function PerformanceDashboard({
  data,
  period,
  branchId,
  branchName,
  branchOpts,
  isHq,
  canPickBranch,
  syncedLabel,
  refDate,
  prevRef,
  nextRef,
  canGoNext,
  monthOptions,
}: {
  data: BranchDashboard;
  period: PeriodType;
  branchId: string;
  branchName: string | null;
  branchOpts: BranchOpt[];
  isHq: boolean;
  /** 지점 선택 드롭다운 노출 (본사 or 여러 지점 소속). 기본값 = isHq */
  canPickBranch?: boolean;
  syncedLabel: string;
  /** 기준일(YYYY-MM-DD) — 월간이면 그 달, 주간이면 그 월~일 주 */
  refDate: string;
  prevRef: string;
  nextRef: string;
  canGoNext: boolean;
  /** 월 점프 드롭다운 (데이터 있는 가장 이른 달 ~ 이번 달, 최신순) */
  monthOptions: { ref: string; label: string }[];
}) {
  const showPicker = canPickBranch ?? isHq;
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');

  const go = (next: { branch?: string; period?: string; ref?: string }) => {
    const p = new URLSearchParams();
    p.set('branch', next.branch ?? branchId);
    p.set('period', next.period ?? period);
    p.set('ref', next.ref ?? refDate);
    router.push(`/performance?${p.toString()}`);
  };

  // 월간 드롭다운의 현재 값: refDate가 속한 달의 1일
  const refMonth = `${refDate.slice(0, 7)}-01`;

  async function refresh() {
    setRefreshing(true);
    setMsg('');
    try {
      const res = await fetch('/api/performance/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error || '새로고침 실패');
      else {
        setMsg(`${d.date} 수집 완료 (디자이너 ${d.designers}명)`);
        router.refresh();
      }
    } catch {
      setMsg('새로고침 중 문제가 생겼어요');
    } finally {
      setRefreshing(false);
    }
  }

  const synced = syncedLabel;

  const f = data.funnel;
  const toneCls: Record<string, string> = {
    good: 'border-ok/30 bg-ok/10',
    warn: 'border-warn/40 bg-warn/10',
    neutral: 'border-line bg-canvas',
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">성과 대시보드</h1>
          <p className="mt-1 text-xs text-ink-soft">
            핸드SOS · {synced} · {branchName ?? ''} · {data.range.label}
          </p>
        </div>
        <button className="btn-ghost w-auto whitespace-nowrap px-4" onClick={refresh} disabled={refreshing}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            새로고침
          </span>
        </button>
      </div>

      {/* 컨트롤: 지점(본사·멀티지점) + 기간 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showPicker && (
          <select className="field w-auto py-2" value={branchId} onChange={(e) => go({ branch: e.target.value })}>
            {branchOpts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {!b.hasSource ? ' (연동 전)' : ''}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-1 rounded-full bg-canvas p-1">
          {(['month', 'week'] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => go({ period: p })}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${period === p ? 'bg-brand text-brand-ink' : 'text-ink-soft'}`}
            >
              {p === 'month' ? '월간' : '주간'}
            </button>
          ))}
        </div>

        {/* 기간 네비게이션: ◀ [기간] ▶ — 월간은 드롭다운 점프, 주간은 라벨 */}
        <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
          <button
            onClick={() => go({ ref: prevRef })}
            className="rounded-full p-1.5 text-ink-soft active:bg-line"
            aria-label="이전 기간"
          >
            <ChevronLeft size={16} />
          </button>
          {period === 'month' ? (
            <select
              className="appearance-none rounded-full bg-transparent px-1 py-1 text-sm font-semibold text-ink outline-none"
              value={monthOptions.some((o) => o.ref === refMonth) ? refMonth : monthOptions[0]?.ref ?? refMonth}
              onChange={(e) => go({ ref: e.target.value })}
              aria-label="월 선택"
            >
              {monthOptions.map((o) => (
                <option key={o.ref} value={o.ref}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-1 text-sm font-semibold tabular-nums">{data.range.label}</span>
          )}
          <button
            onClick={() => go({ ref: nextRef })}
            disabled={!canGoNext}
            className="rounded-full p-1.5 text-ink-soft active:bg-line disabled:opacity-30"
            aria-label="다음 기간"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-ink-soft">{msg}</p>}

      {!data.hasData ? (
        <div className="mt-8 rounded-xl2 border border-line bg-canvas p-8 text-center text-sm text-ink-faint">
          이 지점은 아직 데이터가 없어요.<br />
          {isHq ? 'HandSOS 연동(handsos_pk)·크롤 후 채워져요.' : '본사에 HandSOS 연동을 요청해주세요.'}
        </div>
      ) : (
        <>
          {/* 퍼널: 노출 → 전환 */}
          <h2 className="mt-7 text-base font-bold">고객이 우리한테 오기까지</h2>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-xl2 bg-brand/90 px-4 py-4 text-brand-ink">
              <span className="flex items-center gap-2">
                <Eye size={18} />
                <span>
                  <b className="block">"우리 콘텐츠 발견!"</b>
                  <span className="text-xs opacity-90">블로그·릴스 조회수</span>
                </span>
              </span>
              <span className="text-2xl font-extrabold">{f.exposure.toLocaleString()}</span>
            </div>
            <p className="text-center text-xs text-ink-soft">
              ↓ {pctText(f.exposureToConversion)}가 매장까지 왔어요
            </p>
            <div className="flex items-center justify-between rounded-xl2 bg-warn/90 px-4 py-4 text-white">
              <span className="flex items-center gap-2">
                <CalendarCheck size={18} />
                <span>
                  <b className="block">"예약, 잘 부탁해요"</b>
                  <span className="text-xs opacity-90">실제 방문(접객수)</span>
                </span>
              </span>
              <span className="text-2xl font-extrabold">{f.conversion.toLocaleString()}</span>
            </div>
          </div>

          {/* 진단 */}
          <div className={`mt-4 flex gap-3 rounded-xl2 border p-4 ${toneCls[data.diagnosis.tone]}`}>
            {data.diagnosis.tone === 'good' ? <Sparkles size={20} className="mt-0.5 shrink-0 text-ok" /> : <Wrench size={20} className="mt-0.5 shrink-0 text-warn" />}
            <div>
              <p className="font-bold">{data.diagnosis.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{data.diagnosis.body}</p>
            </div>
          </div>

          {/* 매출 */}
          <h2 className="mt-7 text-base font-bold">{data.range.label} 매출</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              { label: '전체', v: data.sales.total, d: data.sales.totalDelta },
              { label: '신규', v: data.sales.new, d: data.sales.newDelta },
              { label: '재방', v: data.sales.repeat, d: data.sales.repeatDelta },
            ].map((c) => (
              <div key={c.label} className="rounded-xl2 border border-line bg-surface p-3">
                <p className="text-xs text-ink-faint">{c.label}</p>
                <p className="mt-1 text-lg font-extrabold leading-tight">{won(c.v)}</p>
                <Delta v={c.d} />
              </div>
            ))}
          </div>

          {/* 시술 구성 + 지표 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <p className="text-xs text-ink-faint">객단가</p>
              <p className="mt-1 text-lg font-extrabold">{data.avgPrice.toLocaleString()}원</p>
              <p className="mt-3 text-xs text-ink-faint">복구매직 비율</p>
              <p className="mt-1 text-lg font-extrabold">{Math.round(data.recoveryRatio * 100)}%</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <p className="mb-2 text-xs text-ink-faint">시술 구성 (총 {data.totalTreatments}건)</p>
              <ul className="space-y-1 text-sm">
                {[
                  ['복구매직', data.treatments.recovery],
                  ['펌', data.treatments.perm],
                  ['염색', data.treatments.dye],
                  ['클리닉', data.treatments.clinic],
                  ['컷', data.treatments.cut],
                  ['기타', data.treatments.etc],
                ].map(([k, v]) => (
                  <li key={k as string} className="flex justify-between">
                    <span className="text-ink-soft">{k}</span>
                    <span className="font-semibold tabular-nums">{(v as number).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            * 노출은 앱에 기록된 블로그·릴스 조회수 기준이에요. 유입경로·플레이스 노출 연동은 준비 중.
          </p>
        </>
      )}
    </div>
  );
}
