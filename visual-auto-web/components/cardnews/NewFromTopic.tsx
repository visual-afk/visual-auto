'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Brand = { id: string; name: string };
type Mode = 'info' | 'image';

/**
 * 주제로 카드뉴스 만들기 — 블로그 글 없이 브랜드 + 주제로 카드 생성.
 *  - 텍스트형(info): 표지·포인트·CTA 정보형 카드.
 *  - 사진형(image): 사진 업로드 → 사진 위 헤드라인 자막 + 하단 그라데이션 (뉴스·매거진형).
 */
export default function NewFromTopic({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(brands[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('info');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** 사진들을 post-photos 버킷에 올리고 storage_path 배열을 돌려준다. */
  async function uploadPhotos(list: File[]): Promise<string[]> {
    const uploads = list.slice(0, 8).map(async (file, i) => {
      const form = new FormData();
      form.set('photo', file);
      form.set('slot', String(i));
      const res = await fetch('/api/upload-photo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '사진 업로드 실패');
      return data.storage_path as string;
    });
    return Promise.all(uploads);
  }

  async function create() {
    if (!branchId || !topic.trim() || busy) return;
    if (mode === 'image' && files.length === 0) {
      setError('사진을 한 장 이상 올려주세요');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { branch_id: branchId, topic: topic.trim() };
      if (mode === 'image') {
        payload.mode = 'image';
        payload.photos = await uploadPhotos(files);
      } else {
        payload.card_count = count;
      }
      const res = await fetch('/api/card-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      router.push(`/card-news/${data.cardNews.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (brands.length === 0) return null;

  const tabClass = (m: Mode) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${
      mode === m ? 'bg-brand text-brand-ink' : 'bg-canvas text-ink-soft'
    }`;

  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">주제로 카드뉴스 만들기</p>
        <div className="flex gap-1">
          <button type="button" className={tabClass('info')} onClick={() => setMode('info')}>
            텍스트형
          </button>
          <button type="button" className={tabClass('image')} onClick={() => setMode('image')}>
            사진형
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <select
          className="field md:w-36"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          aria-label="브랜드"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          className="field flex-1"
          placeholder={mode === 'image' ? '예: 이번주 헤어 트렌드' : '예: 새치, 뽑으면 두 개 나요?'}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
          }}
        />
        {mode === 'info' ? (
          <select
            className="field md:w-24"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            aria-label="카드 장수"
          >
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}장
              </option>
            ))}
          </select>
        ) : null}
        <button
          onClick={create}
          disabled={busy || !topic.trim()}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? '만드는 중…' : '만들기'}
        </button>
      </div>

      {mode === 'image' ? (
        <div className="mt-2">
          <input
            type="file"
            accept="image/*"
            multiple
            className="text-sm"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
          />
          {files.length > 0 && (
            <span className="ml-2 text-xs text-ink-soft">사진 {files.length}장 → 카드 {files.length}장</span>
          )}
        </div>
      ) : null}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-ink-faint">
        {mode === 'image'
          ? '사진 위에 헤드라인 자막 + 하단 어두운 그라데이션으로 나와요 (뉴스·매거진형). 사진 1장당 카드 1장, 최대 8장.'
          : '브랜드 컨셉에 맞춰 정보형 카드(표지·포인트·CTA)가 자동 생성돼요.'}
      </p>
    </div>
  );
}
