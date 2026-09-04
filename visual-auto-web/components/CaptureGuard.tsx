'use client';

import { useEffect, useState } from 'react';

/**
 * 캡처 '방해' 장치 모음 (UI 없음, 효과는 보조적).
 *  - 우클릭(컨텍스트 메뉴) 차단
 *  - 탭 전환 / 창 포커스 이탈 시 본문 블러 (.capture-blur)  ← 녹화도구·탭 캡처 방해
 *  - PrintScreen 감지 → 클립보드 비우기 + 경고 토스트
 *
 * ⚠️ 한계: 데스크톱 위주 효과다. 모바일 폰 스크린샷·다른 폰 촬영은 막지 못한다.
 *   진짜 차단이 필요하면 네이티브 앱(캡처방지 SDK)이 유일한 길.
 */
export default function CaptureGuard() {
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const blur = () => root.classList.add('capture-blur');
    const unblur = () => root.classList.remove('capture-blur');
    const onVisibility = () => (document.hidden ? blur() : unblur());

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        // 클립보드에 캡처가 들어갔을 가능성 → 비운다 (best-effort, 권한 없으면 무시)
        navigator.clipboard?.writeText('').catch(() => {});
        setWarned(true);
      }
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', unblur);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', unblur);
      window.removeEventListener('keyup', onKeyUp);
      unblur();
    };
  }, []);

  // 경고 토스트는 몇 초 후 자동 닫힘
  useEffect(() => {
    if (!warned) return;
    const t = setTimeout(() => setWarned(false), 4000);
    return () => clearTimeout(t);
  }, [warned]);

  if (!warned) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] mx-auto max-w-phone px-5">
      <div className="rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white shadow-card">
        캡처가 감지됐어요. 고객정보 유출은 법적 책임이 따릅니다.
      </div>
    </div>
  );
}
