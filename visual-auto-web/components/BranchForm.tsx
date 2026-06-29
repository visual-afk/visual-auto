'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type BranchData = {
  id?: string;
  name: string;
  region: string | null;
  knowledge_slug: string | null;
  naver_blog_url: string | null;
  imweb_url: string | null;
};

/** 지점 생성/수정 겸용 폼. initial이 있으면 수정 모드. */
export default function BranchForm({
  initial,
  onDone,
}: {
  initial?: BranchData;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [slug, setSlug] = useState(initial?.knowledge_slug ?? '');
  const [naver, setNaver] = useState(initial?.naver_blog_url ?? '');
  const [imweb, setImweb] = useState(initial?.imweb_url ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('지점 이름을 입력해주세요');
      return;
    }
    setLoading(true);
    const url = editing ? `/api/branches/${initial!.id}` : '/api/branches';
    const res = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        region,
        knowledge_slug: slug,
        naver_blog_url: naver,
        imweb_url: imweb,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || '저장에 실패했어요');
      return;
    }
    if (!editing) {
      setName('');
      setRegion('');
      setSlug('');
      setNaver('');
      setImweb('');
    }
    onDone?.();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">지점 이름 *</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 잠실점" />
        </label>
        <label className="block">
          <span className="label">지역</span>
          <input className="field" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 서울 송파구" />
        </label>
        <label className="block">
          <span className="label">지식베이스 slug</span>
          <input className="field" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="예: 잠실점" />
        </label>
        <label className="block">
          <span className="label">네이버 블로그 URL</span>
          <input className="field" value={naver} onChange={(e) => setNaver(e.target.value)} placeholder="https://blog.naver.com/..." />
        </label>
        <label className="block md:col-span-2">
          <span className="label">아임웹 URL</span>
          <input className="field" value={imweb} onChange={(e) => setImweb(e.target.value)} placeholder="https://..." />
        </label>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={save} disabled={loading}>
          {loading ? '저장 중…' : editing ? '저장' : '지점 추가'}
        </button>
        {editing && onDone && (
          <button className="btn-ghost" onClick={onDone} disabled={loading}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}
