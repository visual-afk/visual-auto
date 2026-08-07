'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { C } from './theme';

/**
 * 인라인 편집 텍스트 — 클릭하면 편집, 저장 시 800ms 하이라이트(공통 규칙).
 * onSave는 성공 여부 반환. 실패 시 편집 상태 유지 + 에러.
 */
export function InlineText({
  value,
  placeholder,
  onSave,
  multiline,
  emptyLabel = '+ 입력',
  textClass,
  textStyle,
}: {
  value: string | null;
  placeholder?: string;
  onSave: (next: string) => Promise<{ ok: boolean; error?: string }>;
  multiline?: boolean;
  emptyLabel?: string;
  textClass?: string;
  textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    setDraft(value ?? '');
    setErr(null);
    setEditing(true);
  };

  const commit = async () => {
    if (draft === (value ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const res = await onSave(draft.trim());
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    } else {
      setErr(res.error ?? '저장 실패');
    }
  };

  if (editing) {
    return (
      <div>
        <div className="flex items-start gap-1.5">
          {multiline ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={placeholder}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: C.card, border: `1px solid ${C.accent}`, color: C.text }}
            />
          ) : (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              placeholder={placeholder}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: C.card, border: `1px solid ${C.accent}`, color: C.text }}
            />
          )}
          <button onClick={commit} disabled={saving} className="rounded-lg p-2" style={{ background: C.accentSoft, color: C.accent }}>
            <Check size={15} />
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg p-2" style={{ background: C.card, color: C.textDim }}>
            <X size={15} />
          </button>
        </div>
        {err && <p className="mt-1 text-xs" style={{ color: C.danger }}>{err}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={start}
      className={`rounded-md text-left transition ${textClass ?? ''}`}
      style={{ ...textStyle, background: flash ? C.accentSoft : 'transparent', outline: 'none' }}
    >
      {value ? value : <span style={{ color: C.textFaint }}>{emptyLabel}</span>}
    </button>
  );
}
