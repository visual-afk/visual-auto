'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, MapPin, AlertTriangle } from 'lucide-react';
import { eventLabel, groomLabel, GROOM_KEYS, type AttendanceEvent } from '@/lib/attendance';
import { kstDateTime, kstThisMonth } from '@/lib/kst';

type Row = AttendanceEvent & { photo_url: string | null; branch_name: string | null };
type Scope = 'me' | 'team' | 'all';

const scopeLabel: Record<Scope, string> = { me: '내 기록', team: '우리 지점', all: '전체 지점' };

export default function AttendanceView({
  scopes,
  defaultScope,
  canSeePhoto,
  canExport,
}: {
  scopes: Scope[];
  defaultScope: Scope;
  canSeePhoto: boolean;
  canExport: boolean;
}) {
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [period, setPeriod] = useState<'today' | 'month'>('today');
  const [month, setMonth] = useState(kstThisMonth());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ scope, period });
    if (period === 'month') qs.set('month', month);
    const res = await fetch(`/api/attendance?${qs.toString()}`);
    const data = await res.json().catch(() => ({ events: [] }));
    setRows(data.events ?? []);
    setLoading(false);
  }, [scope, period, month]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => ({
      날짜시각: kstDateTime(r.created_at),
      이름: r.display_name ?? '',
      지점: r.branch_name ?? '',
      동작: eventLabel[r.event_type],
      '거리(m)': r.distance_m != null ? Math.round(r.distance_m) : '',
      범위내: r.within_geofence == null ? '미설정' : r.within_geofence ? 'O' : 'X',
      명찰: r.groom_nametag ? 'O' : '',
      무전기: r.groom_radio ? 'O' : '',
      메이크업: r.groom_makeup ? 'O' : '',
      헤어: r.groom_hair ? 'O' : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '출근기록');
    const tag = period === 'month' ? month : 'today';
    XLSX.writeFile(wb, `출근기록_${scope}_${tag}.xlsx`);
  }

  return (
    <div>
      {/* 필터 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {scopes.length > 1 &&
          scopes.map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`chip ${scope === s ? 'chip-on' : ''}`}
            >
              {scopeLabel[s]}
            </button>
          ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button onClick={() => setPeriod('today')} className={`chip ${period === 'today' ? 'chip-on' : ''}`}>
          오늘
        </button>
        <button onClick={() => setPeriod('month')} className={`chip ${period === 'month' ? 'chip-on' : ''}`}>
          월별
        </button>
        {period === 'month' && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-sm"
          />
        )}
        {canExport && (
          <button
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft disabled:opacity-50"
          >
            <Download size={15} /> 엑셀
          </button>
        )}
      </div>

      {/* 목록 */}
      <div className="mt-4 overflow-hidden rounded-xl2 border border-line bg-surface">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">기록이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {canSeePhoto && r.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={r.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={r.photo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  </a>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-faint">
                    <MapPin size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold">{r.display_name}</span>
                    <span className="rounded-md bg-brand-wash px-1.5 py-0.5 text-xs font-bold text-brand">
                      {eventLabel[r.event_type]}
                    </span>
                    {r.within_geofence === false && (
                      <AlertTriangle size={13} className="text-warn" aria-label="범위 밖" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">
                    {kstDateTime(r.created_at)}
                    {r.branch_name ? ` · ${r.branch_name}` : ''}
                    {r.distance_m != null ? ` · ${Math.round(r.distance_m)}m` : ''}
                  </span>
                  {r.event_type === 'check_in' && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {GROOM_KEYS.filter((k) => r[`groom_${k}` as keyof Row]).map((k) => (
                        <span key={k} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-soft">
                          {groomLabel[k]}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
