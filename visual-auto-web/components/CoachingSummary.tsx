import { Coffee, PartyPopper } from 'lucide-react';

/**
 * "이번 주(달) 챙길 사람" 요약 배너 — 플래그된 사람만 콕 집어준다.
 * (규칙 기반 집계 결과를 받아 표시만; 상태 없음)
 */
export default function CoachingSummary({
  flagged,
  periodWord,
}: {
  flagged: { name: string; reason: string }[];
  /** '이번 주' | '이번 달' */
  periodWord: string;
}) {
  if (flagged.length === 0) {
    return (
      <div className="mt-6 flex items-center gap-2.5 rounded-xl2 border border-ok/30 bg-ok/5 px-4 py-3.5 text-sm">
        <PartyPopper size={18} className="shrink-0 text-ok" />
        <span className="font-semibold text-ink">{periodWord} 다 잘 하고 있어요. 칭찬 한마디 어때요? 👍</span>
      </div>
    );
  }

  const names = flagged.map((f) => `${f.name}(${f.reason})`).join(' · ');
  const tail = flagged.length === 1 ? '이 한 명만' : `이 ${flagged.length}명만`;

  return (
    <div className="mt-6 rounded-xl2 border border-warn/40 bg-warn/10 px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <Coffee size={16} className="shrink-0 text-warn" />
        {periodWord} 챙길 사람 {flagged.length}명
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {names} — {tail} 코칭하면 돼요
      </p>
    </div>
  );
}
