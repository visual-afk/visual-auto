'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** 이미지형 전용 — 글 본문에서 변환된 인스타 캡션 + 해시태그, 별도 복사 버튼. */
export default function CaptionPanel({
  caption,
  hashtags,
  onCaptionChange,
  onHashtagsChange,
}: {
  caption: string;
  hashtags: string[];
  onCaptionChange: (v: string) => void;
  onHashtagsChange: (v: string[]) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText([caption.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드 거부 시 무시 */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="label mb-0">인스타 캡션</p>
        <button onClick={copyAll} className="flex items-center gap-1 text-sm font-medium text-brand">
          {copied ? <><Check size={14} /> 복사됐어요</> : <><Copy size={14} /> 캡션 복사</>}
        </button>
      </div>
      <textarea
        className="field min-h-28 resize-none"
        value={caption}
        placeholder="지역+시술 / 고민 / 결과 / 예약 유도"
        onChange={(e) => onCaptionChange(e.target.value)}
      />
      <input
        className="field mt-2"
        value={hashtags.join(' ')}
        placeholder="#해시태그 8~10개 (공백 구분)"
        onChange={(e) => onHashtagsChange(e.target.value.split(/\s+/).filter(Boolean))}
      />
    </div>
  );
}
