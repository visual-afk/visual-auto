import StatsOcrUpload from './StatsOcrUpload';

export type PlaceStatRow = {
  id: string;
  stat_date: string;
  period: 'day' | 'week' | 'month';
  place_views: number | null;
  inflows: { name: string; count: number }[] | null;
  review_count: number | null;
};

const PERIOD_LABEL: Record<string, string> = { day: '하루', week: '주간', month: '월간' };

function fmtDate(s: string) {
  const [, m, d] = s.split('-');
  return `${Number(m)}.${Number(d)}`;
}

/** 스마트플레이스 지표 (OCR 스냅샷 기반): 조회 추이 + 최근 유입 + 리뷰 수 */
export default function PlaceStatsSection({ rows, branchId }: { rows: PlaceStatRow[]; branchId: string }) {
  const latest = rows[0] ?? null;
  const trend = [...rows].reverse(); // 오래된 → 최신
  const maxViews = Math.max(1, ...trend.map((r) => r.place_views ?? 0));

  return (
    <section>
      <h2 className="mt-7 text-base font-bold">스마트플레이스</h2>
      <div className="mt-3 space-y-3">
        {latest ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl2 border border-line bg-surface p-4">
                <p className="text-xs text-ink-faint">
                  플레이스 조회수 ({PERIOD_LABEL[latest.period]} · {fmtDate(latest.stat_date)}~)
                </p>
                <p className="mt-1 text-2xl font-extrabold">
                  {latest.place_views != null ? latest.place_views.toLocaleString() : '–'}
                </p>
              </div>
              <div className="rounded-xl2 border border-line bg-surface p-4">
                <p className="text-xs text-ink-faint">리뷰 수</p>
                <p className="mt-1 text-2xl font-extrabold">
                  {latest.review_count != null ? latest.review_count.toLocaleString() : '–'}
                </p>
              </div>
            </div>

            {/* 조회 추이 (스냅샷 막대) */}
            {trend.filter((r) => r.place_views != null).length > 1 && (
              <div className="rounded-xl2 border border-line bg-surface p-4">
                <p className="mb-3 text-xs text-ink-faint">플레이스 조회 추이</p>
                <div className="flex items-end gap-2">
                  {trend.map((r) => (
                    <div key={r.id} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-brand/70"
                        style={{ height: `${Math.max(4, Math.round(((r.place_views ?? 0) / maxViews) * 72))}px` }}
                      />
                      <span className="text-[10px] text-ink-faint">{fmtDate(r.stat_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 최근 유입 */}
            {!!latest.inflows?.length && (
              <div className="rounded-xl2 border border-line bg-surface p-4">
                <p className="mb-2 text-xs text-ink-faint">어디서 들어왔나 (최근 기록)</p>
                <ul className="space-y-1 text-sm">
                  {latest.inflows.slice(0, 8).map((f, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="truncate text-ink-soft">{f.name}</span>
                      <span className="font-semibold tabular-nums">{f.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-xl2 border border-line bg-canvas p-5 text-center text-sm text-ink-faint">
            아직 플레이스 통계가 없어요. 스마트플레이스 통계 화면을 캡처해서 올려보세요.
          </p>
        )}

        <StatsOcrUpload mode="place" branchId={branchId} />
      </div>
    </section>
  );
}
