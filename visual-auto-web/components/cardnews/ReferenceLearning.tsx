'use client';

import { useState } from 'react';

type Brand = { id: string; name: string };
type Profile = {
  design?: Record<string, unknown>;
  editorial?: { tone?: string; hook_style?: string; cta_style?: string; sample_phrases?: string[] };
  image_count?: number;
} | null;

/**
 * 레퍼런스 이미지 학습 (본사) — 브랜드별 레퍼런스를 올리면 Gemini Vision이
 * 디자인 DNA + 에디토리얼 패턴을 추출해 누적 프로필로 저장한다.
 */
export default function ReferenceLearning({ brands }: { brands: Brand[] }) {
  const [branchId, setBranchId] = useState(brands[0]?.id ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile>(null);
  const [loaded, setLoaded] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function loadProfile(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/card-references?branch_id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setProfile(data.profile);
      setLoaded(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onBranchChange(id: string) {
    setBranchId(id);
    setProfile(null);
    setMsg('');
    loadProfile(id);
  }

  async function learn() {
    if (!branchId || files.length === 0 || busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const form = new FormData();
      form.set('branch_id', branchId);
      files.slice(0, 5).forEach((f) => form.append('images', f));
      const res = await fetch('/api/card-references', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '학습 실패');
      setProfile(data.profile);
      setLoaded(branchId);
      setFiles([]);
      const errs = (data.errors ?? []).length ? ` (실패 ${data.errors.length}장)` : '';
      setMsg(`${data.added}장 학습했어요${errs}. 누적 ${data.profile?.image_count ?? 0}장.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!branchId || busy) return;
    if (!window.confirm('이 브랜드의 레퍼런스 학습을 모두 지울까요?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/card-references?branch_id=${branchId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '리셋 실패');
      setProfile(null);
      setMsg('학습을 초기화했어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ed = profile?.editorial;
  const swatches = ['bg', 'surface', 'ink', 'point'] as const;
  const design = (profile?.design ?? {}) as Record<string, string>;

  if (brands.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select
          className="field md:w-40"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
          aria-label="브랜드"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="flex-1 text-sm"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button
          onClick={learn}
          disabled={busy || files.length === 0}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? '학습 중…' : `학습시키기${files.length ? ` (${files.length})` : ''}`}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-faint">JPG·PNG, 장당 10MB, 한 번에 최대 5장. 올릴수록 그 브랜드 스타일이 쌓여요.</p>

      {loaded === branchId && profile && (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-3 text-sm">
          <p className="font-semibold">학습 현황 · 누적 {profile.image_count ?? 0}장</p>
          <div className="mt-2 flex items-center gap-2">
            {swatches.map((k) =>
              design[k] ? (
                <span key={k} className="flex items-center gap-1 text-xs text-ink-soft">
                  <span className="inline-block h-4 w-4 rounded border border-line" style={{ backgroundColor: design[k] }} />
                  {k}
                </span>
              ) : null,
            )}
            {design.mood ? <span className="text-xs text-ink-soft">mood: {design.mood}</span> : null}
            {design.layout ? <span className="text-xs text-ink-soft">layout: {design.layout}</span> : null}
          </div>
          {ed && (ed.tone || ed.hook_style || ed.cta_style) && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
              {ed.tone && <li>톤: {ed.tone}</li>}
              {ed.hook_style && <li>훅: {ed.hook_style}</li>}
              {ed.cta_style && <li>CTA: {ed.cta_style}</li>}
            </ul>
          )}
          <button onClick={reset} disabled={busy} className="mt-2 text-xs text-red-600 hover:underline disabled:opacity-50">
            학습 초기화
          </button>
        </div>
      )}

      {msg && <p className="mt-2 text-sm text-brand">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
