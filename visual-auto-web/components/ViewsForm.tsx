'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';

export default function ViewsForm({
  id,
  initialUrl,
  initialViews,
  initialRemind,
}: {
  id: string;
  initialUrl: string | null;
  initialViews: number | null;
  initialRemind: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [views, setViews] = useState(initialViews != null ? String(initialViews) : '');
  const [remind, setRemind] = useState(initialRemind);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch('/api/posts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'record_views', published_url: url, views, remind }),
    });
    setSaving(false);
    router.push('/track');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label">올린 글 주소</label>
        <input className="field" inputMode="url" placeholder="여기에 붙여넣기" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div>
        <label className="label">지금 조회수</label>
        <div className="relative">
          <input
            className="field pr-10 text-2xl font-bold"
            inputMode="numeric"
            placeholder="0"
            value={views}
            onChange={(e) => setViews(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-faint">회</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRemind((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <span className="flex items-center gap-2 text-sm">
          <Bell size={16} /> 3일 뒤에 다시 물어볼게요
        </span>
        <span className={`h-6 w-11 rounded-full p-0.5 transition ${remind ? 'bg-brand' : 'bg-line'}`}>
          <span className={`block h-5 w-5 rounded-full bg-white transition ${remind ? 'translate-x-5' : ''}`} />
        </span>
      </button>

      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? '저장 중…' : '기록하기'}
      </button>
    </div>
  );
}
