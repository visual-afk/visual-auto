'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import type { PeriodType } from '@/lib/metrics';
import type { BrandDashboard, ProductCatalogRow } from '@/lib/product-metrics';
import PerformanceControls, { type BranchOpt } from '@/components/PerformanceControls';

const won = (n: number) => `${Math.round(n / 10000).toLocaleString()}만원`;
const wonFull = (n: number | null) => (n == null ? '–' : `${n.toLocaleString()}원`);

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

// 채널 바 색 — 브랜드 블루 계열 순차
const CHANNEL_COLORS: Record<string, string> = {
  아임웹: '#5b7fd4',
  스마트스토어: '#4aa17c',
  개별구매: '#b87f26',
};

/** 제품 브랜드(누혜·트리필드·아카데미) 매출 대시보드 — 데이터: 구글시트 주문데이터 집계 */
export default function BrandPerformanceDashboard({
  data,
  catalog,
  period,
  branchId,
  branchName,
  branchOpts,
  syncedLabel,
  refDate,
  prevRef,
  nextRef,
  canGoNext,
  monthOptions,
}: {
  data: BrandDashboard;
  catalog: ProductCatalogRow[];
  period: PeriodType;
  branchId: string;
  branchName: string | null;
  branchOpts: BranchOpt[];
  syncedLabel: string;
  refDate: string;
  prevRef: string;
  nextRef: string;
  canGoNext: boolean;
  monthOptions: { ref: string; label: string }[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');

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
        setMsg(`시트 동기화 완료 (매출 ${d.salesRows}행 · 제품 ${d.products}개)`);
        router.refresh();
      }
    } catch {
      setMsg('새로고침 중 문제가 생겼어요');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">성과 대시보드</h1>
          <p className="mt-1 text-xs text-ink-soft">
            제품 매출 · 구글시트 · {syncedLabel} · {branchName ?? ''} · {data.range.label}
          </p>
        </div>
        <button className="btn-ghost w-auto whitespace-nowrap px-4" onClick={refresh} disabled={refreshing}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            새로고침
          </span>
        </button>
      </div>

      <PerformanceControls
        branchId={branchId}
        period={period}
        refDate={refDate}
        rangeLabel={data.range.label}
        prevRef={prevRef}
        nextRef={nextRef}
        canGoNext={canGoNext}
        monthOptions={monthOptions}
        branchOpts={branchOpts}
        showPicker
      />

      {msg && <p className="mt-3 text-sm text-ink-soft">{msg}</p>}

      {!data.hasData ? (
        <div className="mt-8 rounded-xl2 border border-line bg-canvas p-8 text-center text-sm text-ink-faint">
          아직 이 기간 주문 데이터가 없어요.
          <br />
          구글시트 동기화(매일 06:30) 후 채워져요.
        </div>
      ) : (
        <>
          {/* KPI: 매출은 환불 차감 순액 */}
          <h2 className="mt-7 text-base font-bold">{data.range.label} 제품 매출</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl2 border border-line bg-surface p-3">
              <p className="text-xs text-ink-faint">총매출 (환불 차감)</p>
              <p className="mt-1 text-lg font-extrabold leading-tight">{won(data.sales.total)}</p>
              <Delta v={data.sales.totalDelta} />
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-3">
              <p className="text-xs text-ink-faint">판매 수량</p>
              <p className="mt-1 text-lg font-extrabold leading-tight">{data.qty.toLocaleString()}개</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-3">
              <p className="text-xs text-ink-faint">주문 수</p>
              <p className="mt-1 text-lg font-extrabold leading-tight">{data.orders.toLocaleString()}건</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-3">
              <p className="text-xs text-ink-faint">평균 주문금액</p>
              <p className="mt-1 text-lg font-extrabold leading-tight">{data.avgOrder.toLocaleString()}원</p>
            </div>
          </div>

          {/* 채널별 분해 */}
          <h2 className="mt-7 text-base font-bold">채널별 매출</h2>
          <div className="mt-3 space-y-2 rounded-xl2 border border-line bg-surface p-4">
            {data.channels.map((c) => (
              <div key={c.channel}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{c.channel}</span>
                  <span className="text-ink-soft">
                    <b className="text-ink">{won(c.revenue)}</b> · {c.qty.toLocaleString()}개 · {c.orders.toLocaleString()}건
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(c.ratio * 100)}%`, background: CHANNEL_COLORS[c.channel] ?? '#5b7fd4' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 제품별 Top */}
          {data.topProducts.length > 0 && (
            <>
              <h2 className="mt-7 text-base font-bold">많이 팔린 제품</h2>
              <div className="mt-3 overflow-x-auto rounded-xl2 border border-line bg-surface p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-faint">
                      <th className="py-1.5 pr-2 font-medium">제품</th>
                      <th className="py-1.5 pr-2 text-right font-medium">수량</th>
                      <th className="py-1.5 text-right font-medium">매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.name} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-2">{p.name}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{p.qty.toLocaleString()}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{won(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* 제품·가격 정보 (제품 마스터 시트 미러) */}
      {catalog.length > 0 && (
        <details className="mt-7 rounded-xl2 border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-base font-bold">
            제품·가격 정보 <span className="text-xs font-normal text-ink-faint">({catalog.length}개)</span>
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-faint">
                  <th className="py-1.5 pr-2 font-medium">제품명</th>
                  <th className="py-1.5 pr-2 font-medium">코드</th>
                  <th className="py-1.5 pr-2 text-right font-medium">소비자가</th>
                  <th className="py-1.5 pr-2 text-right font-medium">도매가</th>
                  <th className="py-1.5 pr-2 text-right font-medium">비주얼살롱가</th>
                  <th className="py-1.5 font-medium">배송</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2">{p.name}</td>
                    <td className="py-1.5 pr-2 text-ink-soft">{p.code}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{wonFull(p.consumer_price)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{wonFull(p.wholesale_price)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{wonFull(p.salon_price)}</td>
                    <td className="py-1.5 text-ink-soft">{p.ship_from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        * 아임웹·스마트스토어·개별구매 주문 시트를 집계한 값이에요. 매출은 취소(환불) 차감 순액이라 환불이 큰 기간은 음수일 수 있어요.
      </p>
    </div>
  );
}
