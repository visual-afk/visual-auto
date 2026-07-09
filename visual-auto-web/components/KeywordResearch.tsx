'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import KeywordRankSection from './KeywordRankSection';

export type KeywordRow = {
  keyword: string;
  category: string;
  subcategory: string;
  volume: number | null;
  competition: '낮음' | '중간' | '높음' | null;
  recommend: boolean;
};

export type KeywordSet = {
  id: string;
  branch_id: string | null;
  branch_label: string;
  period: string;
  rows: KeywordRow[];
  source_filename: string | null;
  created_at: string;
};

type UploadResult = {
  period: string;
  filename: string;
  total: number;
  unmatched: string[];
};

const compColor: Record<string, string> = {
  높음: 'text-ink-faint',
  중간: 'text-warn',
  낮음: 'text-ok',
};

export default function KeywordResearch({ initialSets }: { initialSets: KeywordSet[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sets, setSets] = useState<KeywordSet[]>(initialSets);
  const [active, setActive] = useState<string>(initialSets[0]?.branch_label ?? '');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [savingReflect, setSavingReflect] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({}); // `${setId}:::${keyword}` → recommend

  const activeSet = sets.find((s) => s.branch_label === active) ?? null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResult(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/keyword-research', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '업로드에 실패했어요');
      } else {
        setResult({ period: data.period, filename: data.filename, total: data.total, unmatched: data.unmatched || [] });
        await refresh();
      }
    } catch {
      setError('업로드 중 문제가 생겼어요');
    } finally {
      setUploading(false);
    }
  }

  async function refresh() {
    const res = await fetch('/api/keyword-research');
    const data = await res.json().catch(() => ({}));
    const all: KeywordSet[] = data.sets || [];
    const latest = new Map<string, KeywordSet>();
    for (const s of all) if (!latest.has(s.branch_label)) latest.set(s.branch_label, s);
    const list = [...latest.values()];
    setSets(list);
    setDirty({});
    if (!list.some((s) => s.branch_label === active)) setActive(list[0]?.branch_label ?? '');
    router.refresh();
  }

  function toggle(setId: string, keyword: string, next: boolean) {
    setSets((prev) =>
      prev.map((s) =>
        s.id === setId
          ? { ...s, rows: s.rows.map((r) => (r.keyword === keyword ? { ...r, recommend: next } : r)) }
          : s,
      ),
    );
    setDirty((d) => ({ ...d, [`${setId}:::${keyword}`]: next }));
  }

  async function reflect() {
    const entries = Object.entries(dirty);
    if (!entries.length) return;
    setSavingReflect(true);
    try {
      for (const [key, recommend] of entries) {
        const [id, keyword] = key.split(':::');
        await fetch('/api/keyword-research', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, keyword, recommend }),
        });
      }
      setDirty({});
      router.refresh();
    } finally {
      setSavingReflect(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">키워드 조사</h1>
          <p className="mt-1 text-sm text-ink-soft">매달 올리면 디자이너 추천 주제가 갱신돼요</p>
        </div>
        <button className="btn-ghost w-auto whitespace-nowrap px-4" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <span className="inline-flex items-center gap-1.5">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            이번 달 엑셀 올리기
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onPick}
        />
      </div>

      {error && <p className="mt-4 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">{error}</p>}

      {result && (
        <div className="mt-4 flex items-center gap-3 rounded-xl2 border border-ok/30 bg-ok/10 px-4 py-3">
          <FileSpreadsheet size={22} className="shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{result.filename}</p>
            <p className="text-xs text-ink-soft">
              방금 업로드 · 키워드 {result.total.toLocaleString()}개 읽음
              {result.unmatched.length > 0 && ` · 미매칭 지점: ${result.unmatched.join(', ')}`}
            </p>
          </div>
        </div>
      )}

      {sets.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-faint">
          아직 올린 키워드가 없어요. 위에서 지점별 시트가 담긴 엑셀을 올려주세요.
        </p>
      ) : (
        <>
          {/* 지점 탭 */}
          <div className="mt-6 flex flex-wrap gap-2">
            {sets.map((s) => (
              <button
                key={s.branch_label}
                onClick={() => setActive(s.branch_label)}
                className={`chip ${s.branch_label === active ? 'chip-on' : ''}`}
              >
                {s.branch_label}
                {!s.branch_id && <span className="ml-1 text-warn">·미매칭</span>}
              </button>
            ))}
          </div>

          {activeSet && (
            <>
              <div className="mt-4 overflow-hidden rounded-xl2 border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-faint">
                  <span className="flex-1">키워드</span>
                  <span className="w-20 text-right">월 검색량</span>
                  <span className="w-14 text-center">경쟁도</span>
                  <span className="w-16 text-center">추천 주제</span>
                </div>
                <ul className="divide-y divide-line">
                  {activeSet.rows.map((r) => (
                    <li key={r.keyword} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 truncate text-sm font-semibold">{r.keyword}</span>
                      <span className="w-20 text-right text-sm tabular-nums">
                        {r.volume != null ? r.volume.toLocaleString() : '-'}
                      </span>
                      <span className={`w-14 text-center text-sm font-medium ${r.competition ? compColor[r.competition] : 'text-ink-faint'}`}>
                        {r.competition ?? '-'}
                      </span>
                      <span className="flex w-16 justify-center">
                        <button
                          role="switch"
                          aria-checked={r.recommend}
                          onClick={() => toggle(activeSet.id, r.keyword, !r.recommend)}
                          className={`relative h-6 w-11 rounded-full transition ${r.recommend ? 'bg-brand' : 'bg-line'}`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.recommend ? 'left-[22px]' : 'left-0.5'}`}
                          />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  className="btn-primary w-auto px-5"
                  onClick={reflect}
                  disabled={savingReflect || Object.keys(dirty).length === 0}
                >
                  {savingReflect ? '반영 중…' : '추천 주제에 반영하기'}
                </button>
              </div>

              {activeSet.branch_id && <KeywordRankSection branchId={activeSet.branch_id} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
