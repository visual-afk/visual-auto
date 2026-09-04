'use client';

import { useEffect, useState } from 'react';

/**
 * 화면 전체에 본인 식별자(이름·지점·번호뒷4자리·시각)를 대각선 반투명으로 깐다.
 * 목적은 '캡처 차단'이 아니라 '유출 시 누구인지 특정' + 심리적 억제.
 * pointer-events:none 이라 클릭/스크롤은 그대로 통과한다.
 *
 * ⚠️ 한계: OS 스크린샷·화면녹화·다른 폰으로 화면 촬영은 막지 못한다(웹 기술 공통).
 */
export default function Watermark({ identity }: { identity: string }) {
  // 캡처물에 찍힌 시각으로 '언제 봤는지'까지 특정되게 — 1분마다 갱신
  const [stamp, setStamp] = useState('');
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setStamp(fmt());
    const t = setInterval(() => setStamp(fmt()), 60_000);
    return () => clearInterval(t);
  }, []);

  const text = stamp ? `${identity} · ${stamp}` : identity;

  // SVG 한 타일에 텍스트를 그려 background로 반복 → 가볍고 선명
  const tile = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
       <text x="0" y="100" transform="rotate(-30 0 100)"
             font-family="sans-serif" font-size="14" fill="#000">${escapeXml(text)}</text>
     </svg>`,
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] select-none opacity-[0.07]"
      style={{
        backgroundImage: `url("data:image/svg+xml,${tile}")`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}
