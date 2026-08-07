'use client';

import CardCanvas, { CARD_W, CARD_H } from './CardCanvas';
import type { ComponentProps } from 'react';

/** 1080×1350 CardCanvas를 원하는 폭으로 축소해 보여주는 미리보기 래퍼. */
export default function ScaledCard({
  width,
  ...canvasProps
}: { width: number } & ComponentProps<typeof CardCanvas>) {
  const scale = width / CARD_W;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl border border-line"
      style={{ width, height: Math.round(CARD_H * scale) }}
    >
      <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardCanvas {...canvasProps} />
      </div>
    </div>
  );
}
