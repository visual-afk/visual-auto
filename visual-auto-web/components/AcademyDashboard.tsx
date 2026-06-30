'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, Loader2, Users, UserPlus, ShoppingBag } from 'lucide-react';
import type { AcademyDashboard as AcademyData, PeriodType } from '@/lib/metrics';

const won = (n: number) => `${Math.round(n / 10000).toLocaleString()}만원`;
const pctText = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);

export default function AcademyDashboard({ data, period }: { data: AcademyData; period: PeriodType }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const go = (p: PeriodType) => router.push(`/academy?period=${p}`);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setMsg('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/academy', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || '업로드 실패');
      else {
        setMsg(`${d.filename} · ${d.rows}행 반영`);
        router.refresh();
      }
    } catch {
      setErr('업로드 중 문제가 생겼어요');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">아카데미 마케팅</h1>
          <p className="mt-1 text-xs text-ink-soft">아임웹 유입·전환 · {data.range.label} · 지점과 별도 사업</p>
        </div>
        <button className="btn-ghost w-auto whitespace-nowrap px-4" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <span className="inline-flex items-center gap-1.5">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            엑셀 올리기
          </span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onPick} />
      </div>

      <div className="mt-3 flex gap-1 rounded-full bg-canvas p-1 w-fit">
        {(['month', 'week'] as PeriodType[]).map((p) => (
          <button key={p} onClick={() => go(p)} className={`rounded-full px-3 py-1 text-sm font-semibold ${period === p ? 'bg-brand text-brand-ink' : 'text-ink-soft'}`}>
            {p === 'month' ? '월간' : '주간'}
          </button>
        ))}
      </div>

      {err && <p className="mt-3 text-sm text-warn">{err}</p>}
      {msg && (
        <div className="mt-4 flex items-center gap-3 rounded-xl2 border border-ok/30 bg-ok/10 px-4 py-3">
          <FileSpreadsheet size={20} className="text-ok" />
          <p className="text-sm font-semibold">{msg}</p>
        </div>
      )}

      {!data.hasData ? (
        <div className="mt-8 rounded-xl2 border border-line bg-canvas p-8 text-center text-sm text-ink-faint">
          아직 데이터가 없어요. 아임웹 마케팅(일별_마케팅) 엑셀을 올려주세요.
        </div>
      ) : (
        <>
          {/* 퍼널 */}
          <h2 className="mt-7 text-base font-bold">방문 → 회원 → 구매</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <Users size={18} className="text-brand" />
              <p className="mt-2 text-xs text-ink-faint">방문자</p>
              <p className="text-xl font-extrabold">{data.totals.visitors.toLocaleString()}</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <UserPlus size={18} className="text-brand" />
              <p className="mt-2 text-xs text-ink-faint">회원전환</p>
              <p className="text-xl font-extrabold">{data.totals.signups.toLocaleString()}</p>
              <p className="text-xs text-ink-soft">전환율 {pctText(data.funnel.signupRate)}</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <ShoppingBag size={18} className="text-brand" />
              <p className="mt-2 text-xs text-ink-faint">구매자</p>
              <p className="text-xl font-extrabold">{data.totals.buyers.toLocaleString()}</p>
              <p className="text-xs text-ink-soft">전환율 {pctText(data.funnel.purchaseRate)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <p className="text-xs text-ink-faint">총 구매금액</p>
              <p className="mt-1 text-lg font-extrabold">{won(data.totals.purchaseAmount)}</p>
            </div>
            <div className="rounded-xl2 border border-line bg-surface p-4">
              <p className="text-xs text-ink-faint">평균 주문금액</p>
              <p className="mt-1 text-lg font-extrabold">{data.funnel.avgOrder.toLocaleString()}원</p>
            </div>
          </div>

          {/* 유입경로 */}
          <h2 className="mt-7 text-base font-bold">유입경로</h2>
          <div className="mt-3 space-y-2">
            {data.channels.map((c) => (
              <div key={c.channel} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{c.channel}</span>
                  <span className="text-ink-soft">{Math.round(c.ratio * 100)}% · {c.visitors.toLocaleString()}명</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(c.ratio * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
