'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Flame, Mic, Square } from 'lucide-react';
import { useRecorder, fmtSeconds, blobToBase64 } from '@/lib/useRecorder';

type Branch = { id: string; name: string };
type CheckItem = { template_id: string; item: string; checked: boolean };
type Journal = { id: string; journal_date: string; am_text: string | null; pm_text: string | null };

const AM_PLACEHOLDER =
  '시술 이외에 원장으로서 어떤 것을 했는지 — 업무배치, 라운딩, 매장을 위해 한 일…';
const PM_PLACEHOLDER = '오후에 챙긴 것, 내일로 넘긴 것…';

export default function JournalStudio({
  branches,
  defaultBranchId,
}: {
  branches: Branch[];
  defaultBranchId: string | null;
}) {
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [today, setToday] = useState('');
  const [amText, setAmText] = useState('');
  const [pmText, setPmText] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bid: string) => {
    setError(null);
    try {
      const [checkRes, journalRes] = await Promise.all([
        fetch(`/api/daily-check?branch_id=${bid}`),
        fetch(`/api/journal?branch_id=${bid}`),
      ]);
      const checkData = await checkRes.json();
      const journalData = await journalRes.json();
      if (!checkRes.ok) throw new Error(checkData.error);
      if (!journalRes.ok) throw new Error(journalData.error);
      setChecks(checkData.items ?? []);
      setJournals(journalData.journals ?? []);
      setToday(journalData.today);
      const todayJournal = (journalData.journals ?? []).find(
        (j: Journal) => j.journal_date === journalData.today,
      );
      setAmText(todayJournal?.am_text ?? '');
      setPmText(todayJournal?.pm_text ?? '');
    } catch (e) {
      setError((e as Error).message || '불러오지 못했어요');
    }
  }, []);

  useEffect(() => {
    if (branchId) void load(branchId);
  }, [branchId, load]);

  // ── 오픈 체크 토글 (낙관적) ─────────────────────────────────────────
  const toggleCheck = async (templateId: string, next: boolean) => {
    if (!branchId) return;
    setChecks((cs) => cs.map((c) => (c.template_id === templateId ? { ...c, checked: next } : c)));
    const res = await fetch('/api/daily-check', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, template_id: templateId, checked: next }),
    });
    if (!res.ok) {
      setChecks((cs) => cs.map((c) => (c.template_id === templateId ? { ...c, checked: !next } : c)));
    }
  };

  // ── 일지 저장 (blur 시) ─────────────────────────────────────────────
  const saveJournal = async (patch: { am_text?: string; pm_text?: string }) => {
    if (!branchId) return;
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '저장에 실패했어요');
      return;
    }
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    setJournals((js) => {
      const rest = js.filter((j) => j.journal_date !== data.journal.journal_date);
      return [data.journal, ...rest].sort((a, b) => (a.journal_date < b.journal_date ? 1 : -1));
    });
  };

  // ── 스트릭: 최근 7일 중 일지 기록일 수 ──────────────────────────────
  const streak7 = useMemo(() => {
    if (!today) return 0;
    const start = new Date(`${today}T00:00:00+09:00`).getTime() - 6 * 24 * 3600e3;
    return journals.filter((j) => {
      const t = new Date(`${j.journal_date}T00:00:00+09:00`).getTime();
      return t >= start && (j.am_text || j.pm_text);
    }).length;
  }, [journals, today]);

  const doneCount = checks.filter((c) => c.checked).length;
  const pastJournals = journals.filter((j) => j.journal_date !== today && (j.am_text || j.pm_text));

  return (
    <div className="mt-5 space-y-4">
      {branches.length > 1 && (
        <select
          value={branchId ?? ''}
          onChange={(e) => setBranchId(e.target.value)}
          className="w-full rounded-xl2 border border-line bg-surface px-4 py-2.5 text-sm font-semibold"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {error && (
        <p className="rounded-xl2 border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>
      )}

      {/* 오늘 오픈 체크 */}
      <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">오늘 오픈 체크</h2>
          <span className={`text-sm font-semibold ${doneCount === checks.length && checks.length > 0 ? 'text-ok' : 'text-ink-faint'}`}>
            {doneCount}/{checks.length}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <li key={c.template_id}>
              <button
                type="button"
                onClick={() => toggleCheck(c.template_id, !c.checked)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  c.checked ? 'border-ok/40 bg-ok/5 text-ink-soft' : 'border-line bg-canvas'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    c.checked ? 'border-ok bg-ok text-white' : 'border-line bg-surface'
                  }`}
                >
                  {c.checked && <Check size={13} strokeWidth={3} />}
                </span>
                <span className={c.checked ? 'line-through decoration-ink-faint/50' : ''}>{c.item}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 오늘 일지 */}
      <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">오늘 일지</h2>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1 font-semibold text-brand">
              <Flame size={13} /> 최근 7일 {streak7}일 기록
            </span>
            {savedAt && <span>저장됨 {savedAt}</span>}
          </div>
        </div>
        <JournalField
          label="오전"
          value={amText}
          placeholder={AM_PLACEHOLDER}
          onChange={setAmText}
          onBlur={() => void saveJournal({ am_text: amText })}
          onDictated={(text) => {
            const next = amText ? `${amText}\n${text}` : text;
            setAmText(next);
            void saveJournal({ am_text: next });
          }}
        />
        <JournalField
          label="오후"
          value={pmText}
          placeholder={PM_PLACEHOLDER}
          onChange={setPmText}
          onBlur={() => void saveJournal({ pm_text: pmText })}
          onDictated={(text) => {
            const next = pmText ? `${pmText}\n${text}` : text;
            setPmText(next);
            void saveJournal({ pm_text: next });
          }}
        />
      </section>

      {/* 지난 일지 */}
      {pastJournals.length > 0 && (
        <section>
          <h2 className="text-base font-bold">이번 달 지난 일지</h2>
          <ul className="mt-2 space-y-2">
            {pastJournals.map((j) => (
              <PastJournal key={j.id} journal={j} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function JournalField({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
  onDictated,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onDictated: (text: string) => void;
}) {
  const { recording, seconds, start, stop } = useRecorder();
  const [busy, setBusy] = useState(false);

  const toggleRecord = async () => {
    if (recording) {
      const blob = await stop();
      if (!blob) return;
      setBusy(true);
      try {
        const base64 = await blobToBase64(blob);
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mime_type: blob.type }),
        });
        const data = await res.json();
        if (res.ok && data.text) onDictated(data.text);
      } finally {
        setBusy(false);
      }
    } else {
      await start().catch(() => {});
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-faint">{label}</p>
        <button
          type="button"
          onClick={() => void toggleRecord()}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            recording ? 'bg-red-500 text-white' : 'bg-brand-wash text-brand'
          } disabled:opacity-50`}
        >
          {recording ? (
            <>
              <Square size={11} /> {fmtSeconds(seconds)} 끝내기
            </>
          ) : busy ? (
            '받아쓰는 중…'
          ) : (
            <>
              <Mic size={11} /> 말로 남기기
            </>
          )}
        </button>
      </div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={3}
        className="mt-1.5 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm leading-relaxed placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />
    </div>
  );
}

function PastJournal({ journal }: { journal: Journal }) {
  const [open, setOpen] = useState(false);
  const [, m, d] = journal.journal_date.split('-');
  return (
    <li className="rounded-xl2 border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">
          {Number(m)}월 {Number(d)}일
        </span>
        <span className="truncate pl-3 text-xs text-ink-faint">
          {open ? '' : (journal.am_text || journal.pm_text || '').slice(0, 30)}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {journal.am_text && (
            <p>
              <span className="font-semibold text-ink-faint">오전 </span>
              {journal.am_text}
            </p>
          )}
          {journal.pm_text && (
            <p>
              <span className="font-semibold text-ink-faint">오후 </span>
              {journal.pm_text}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
