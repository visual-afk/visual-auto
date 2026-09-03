'use client';

import { useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import {
  clampPhotoOffset,
  clampPhotoScale,
  photoLayout,
  PHOTO_SCALE_MAX,
  PHOTO_SCALE_MIN,
} from '@/lib/cardnews/cards';

const BOX_W = 176; // 미리보기 폭 (카드와 같은 4:5)
const BOX_H = Math.round((BOX_W * 1350) / 1080);

/**
 * 카드 사진 맞추기 — 드래그로 위치, 슬라이더로 확대.
 * 미리보기는 CardCanvas 와 **같은 계산식**(photoLayout)을 써서 보이는 그대로 PNG로 나온다.
 * 확대한 만큼만 움직일 수 있어(clampPhotoOffset) 사진이 카드 밖으로 빠지지 않는다.
 */
export default function PhotoAdjuster({
  photoUrl,
  scale,
  x,
  y,
  onChange,
}: {
  photoUrl: string;
  scale?: number;
  x?: number;
  y?: number;
  onChange: (v: { photo_scale: number; photo_x: number; photo_y: number }) => void;
}) {
  const s = clampPhotoScale(scale);
  const ox = clampPhotoOffset(x, s);
  const oy = clampPhotoOffset(y, s);
  const box = photoLayout({ photo_scale: s, photo_x: ox, photo_y: oy }, BOX_W, BOX_H);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const canMove = s > 1;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canMove) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox, oy };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // 미리보기에서 움직인 픽셀 → 카드 크기 대비 비율
    const nx = d.ox + (e.clientX - d.px) / BOX_W;
    const ny = d.oy + (e.clientY - d.py) / BOX_H;
    onChange({ photo_scale: s, photo_x: clampPhotoOffset(nx, s), photo_y: clampPhotoOffset(ny, s) });
  }

  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  function setScale(next: number) {
    const ns = clampPhotoScale(next);
    // 축소하면 이동 가능 범위가 줄어드니 오프셋도 다시 자른다
    onChange({ photo_scale: ns, photo_x: clampPhotoOffset(ox, ns), photo_y: clampPhotoOffset(oy, ns) });
  }

  return (
    <div className="mt-2 flex gap-3">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ width: BOX_W, height: BOX_H, touchAction: 'none' }}
        className={`relative shrink-0 overflow-hidden rounded-xl border border-line bg-ink-faint/10 ${
          canMove ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: box.left,
            top: box.top,
            width: box.w,
            height: box.h,
            objectFit: 'cover',
            userSelect: 'none',
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-faint">사진 크기</span>
          <span className="text-xs text-ink-soft">{Math.round(s * 100)}%</span>
        </div>
        <input
          type="range"
          min={PHOTO_SCALE_MIN * 100}
          max={PHOTO_SCALE_MAX * 100}
          step={5}
          value={Math.round(s * 100)}
          onChange={(e) => setScale(Number(e.target.value) / 100)}
          className="w-full accent-brand"
          aria-label="사진 크기"
        />
        <p className="mt-1 text-xs text-ink-faint">
          {canMove ? '사진을 끌어서 위치를 잡아요' : '크게 키우면 끌어서 위치를 옮길 수 있어요'}
        </p>
        {(s !== 1 || ox !== 0 || oy !== 0) && (
          <button
            onClick={() => onChange({ photo_scale: 1, photo_x: 0, photo_y: 0 })}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-brand"
          >
            <Crosshair size={12} /> 가운데로
          </button>
        )}
      </div>
    </div>
  );
}
