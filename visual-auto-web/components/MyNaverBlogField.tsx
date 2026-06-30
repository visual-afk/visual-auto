'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

/**
 * 본인 개인 네이버 블로그 글쓰기 링크 등록/표시.
 * - 링크 있음: "네이버 블로그 열기" 버튼(onOpen) + 링크 변경
 * - 링크 없음: 안내 + 입력칸 + 저장 (폴백 없음)
 */
export default function MyNaverBlogField({
  initialUrl,
  onChange,
  onOpen,
  disabled = false,
}: {
  initialUrl: string | null;
  onChange: (url: string | null) => void; // 부모(WriteStudio)의 publish 대상 갱신
  onOpen: () => void; // "네이버 블로그 열기" 클릭 = 발행 흐름 실행
  disabled?: boolean; // 검토 전에는 발행 잠금
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [editing, setEditing] = useState(!initialUrl);
  const [draft, setDraft] = useState(initialUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const trimmed = draft.trim();
    if (!trimmed) {
      setError('주소를 입력해주세요');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/me/blog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naver_blog_url: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || '저장에 실패했어요');
      return;
    }
    setUrl(data.naver_blog_url);
    onChange(data.naver_blog_url);
    setEditing(false);
  }

  // 링크 있음 & 편집 아님 → 열기 버튼
  if (url && !editing) {
    return (
      <div className="flex flex-col items-stretch gap-1 md:items-end">
        <button className="btn-primary md:w-auto md:px-6 disabled:opacity-40" onClick={onOpen} disabled={disabled}>
          네이버 블로그 열기
        </button>
        <button className="text-xs text-ink-faint underline" onClick={() => setEditing(true)}>
          내 블로그 링크 변경
        </button>
      </div>
    );
  }

  // 링크 없음/편집 중 → 입력 + 저장
  return (
    <div className="w-full space-y-2 rounded-2xl border border-line bg-canvas p-3 md:w-96">
      <div className="flex items-start gap-2 text-sm text-brand">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>내 네이버 블로그 글쓰기 주소를 등록하면, 이 버튼이 내 블로그 글쓰기 화면을 바로 열어요.</span>
      </div>
      <input
        className="field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://blog.naver.com/내아이디?Redirect=Write&"
      />
      {error && <p className="text-sm text-warn">{error}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50" onClick={save} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
        {url && (
          <button className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold" onClick={() => setEditing(false)}>
            취소
          </button>
        )}
      </div>
      <p className="text-xs text-ink-faint">한 번 로그인해두면 다음부터 계속 그 상태로 열려요.</p>
    </div>
  );
}
