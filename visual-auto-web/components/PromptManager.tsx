'use client';

import { useEffect, useMemo, useState } from 'react';

export type CatalogEntry = {
  kind: 'prompt' | 'knowledge';
  slug: string;
  label: string;
  group: string;
  fileDefault: string;
  override: string | null;
  updatedAt: string | null;
};

type Branch = { id: string; name: string };

const keyOf = (e: { kind: string; slug: string }) => `${e.kind}:${e.slug}`;

export default function PromptManager({
  branches,
  initialItems,
}: {
  branches: Branch[];
  initialItems: CatalogEntry[];
}) {
  const [scope, setScope] = useState<string>(''); // '' = 전사 공통, 아니면 branchId
  const [items, setItems] = useState<CatalogEntry[]>(initialItems);
  const [selectedKey, setSelectedKey] = useState<string>(initialItems[0] ? keyOf(initialItems[0]) : '');
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(() => items.find((i) => keyOf(i) === selectedKey) ?? null, [items, selectedKey]);
  const effective = selected ? (selected.override ?? selected.fileDefault) : '';
  const dirty = selected != null && draft !== effective;

  // 선택/범위가 바뀌면 편집창을 현재 유효값으로 초기화
  useEffect(() => {
    setDraft(effective);
    setNotice('');
    setError('');
  }, [selectedKey, effective]);

  // 그룹별로 묶기 (카탈로그 순서 유지)
  const groups = useMemo(() => {
    const out: { name: string; items: CatalogEntry[] }[] = [];
    for (const it of items) {
      let g = out.find((x) => x.name === it.group);
      if (!g) out.push((g = { name: it.group, items: [] }));
      g.items.push(it);
    }
    return out;
  }, [items]);

  async function loadScope(nextScope: string) {
    setScope(nextScope);
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const qs = nextScope ? `?branch_id=${encodeURIComponent(nextScope)}` : '';
      const res = await fetch(`/api/admin/prompts${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '불러오지 못했어요');
      setItems(data.items as CatalogEntry[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: selected.kind, slug: selected.slug, branch_id: scope || null, content: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장에 실패했어요');
      // 로컬 상태 갱신 (override 반영)
      setItems((prev) =>
        prev.map((i) => (keyOf(i) === selectedKey ? { ...i, override: draft, updatedAt: new Date().toISOString() } : i)),
      );
      setNotice('저장했어요. 바로 반영돼요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    if (!selected || selected.override == null) return;
    if (!confirm('이 범위의 수정을 지우고 원본으로 되돌릴까요?')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: selected.kind, slug: selected.slug, branch_id: scope || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '되돌리지 못했어요');
      setItems((prev) =>
        prev.map((i) => (keyOf(i) === selectedKey ? { ...i, override: null, updatedAt: null } : i)),
      );
      setDraft(selected.fileDefault);
      setNotice('원본으로 되돌렸어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const scopeLabel = scope ? branches.find((b) => b.id === scope)?.name ?? '지점' : '전사 공통';

  return (
    <div className="mt-5">
      {/* 범위 선택 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3 shadow-card">
        <span className="label mb-0">적용 범위</span>
        <select
          className="field w-auto"
          value={scope}
          onChange={(e) => loadScope(e.target.value)}
          disabled={loading || saving}
        >
          <option value="">전사 공통 (모든 지점)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} 전용
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-faint">
          {scope
            ? '이 지점만 다른 프롬프트를 쓰게 돼요 (없으면 전사 공통 사용).'
            : '모든 지점·디자이너에게 적용되는 기본 프롬프트예요.'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(200px,260px)_1fr]">
        {/* 항목 목록 */}
        <nav className="rounded-xl2 border border-line bg-surface p-2 shadow-card">
          {groups.map((g) => (
            <div key={g.name} className="mb-2">
              <p className="px-2 py-1 text-xs font-bold text-ink-faint">{g.name}</p>
              {g.items.map((it) => {
                const active = keyOf(it) === selectedKey;
                return (
                  <button
                    key={keyOf(it)}
                    onClick={() => setSelectedKey(keyOf(it))}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                      active ? 'bg-brand-wash font-semibold text-brand' : 'text-ink-soft hover:bg-canvas'
                    }`}
                  >
                    <span className="min-w-0 truncate">{it.label}</span>
                    {it.override != null && (
                      <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-ink">
                        수정됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 편집기 */}
        <section className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
          {!selected ? (
            <p className="text-sm text-ink-faint">왼쪽에서 편집할 항목을 골라주세요.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">{selected.label}</h2>
                  <p className="text-xs text-ink-faint">
                    {scopeLabel} · {selected.kind === 'prompt' ? '프롬프트' : selected.slug}
                    {selected.override != null ? ' · 수정본 적용 중' : ' · 원본(파일) 사용 중'}
                  </p>
                </div>
              </div>

              <textarea
                className="field min-h-[360px] font-mono text-[13px] leading-relaxed"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={loading || saving}
                spellCheck={false}
              />

              {error && <p className="mt-2 text-sm text-warn">{error}</p>}
              {notice && <p className="mt-2 text-sm text-brand">{notice}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" onClick={save} disabled={saving || loading || !dirty}>
                  {saving ? '저장 중…' : '저장'}
                </button>
                {dirty && (
                  <button className="btn-ghost" onClick={() => setDraft(effective)} disabled={saving}>
                    변경 취소
                  </button>
                )}
                {selected.override != null && (
                  <button
                    className="btn-ghost text-warn"
                    onClick={revert}
                    disabled={saving || loading}
                  >
                    원본으로 되돌리기
                  </button>
                )}
              </div>

              {selected.override != null && selected.override !== selected.fileDefault && (
                <details className="mt-4 rounded-xl border border-line bg-canvas p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-ink-soft">파일 원본 보기</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[12px] text-ink-faint">
                    {selected.fileDefault}
                  </pre>
                </details>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
