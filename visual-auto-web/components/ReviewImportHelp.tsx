'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MousePointerClick, ExternalLink } from 'lucide-react';

/**
 * 북마클릿: pcmap.place.naver.com 리뷰 페이지에서 실행하면
 * 그 페이지에 렌더된 리뷰 DOM을 읽어 앱 /review#import=... 로 넘긴다.
 * fetch 가 아니라 페이지 이동이라 네이버 CSP/CORS 에 안 걸린다.
 * __APP_ORIGIN__ 은 렌더 시점의 window.location.origin 으로 치환.
 */
const BOOKMARKLET_SRC = `javascript:(function(){var L=document.querySelectorAll('#_review_list > li');document.querySelectorAll('#_review_list a[class*="pui__jhpEyP"]').forEach(function(b){try{b.click()}catch(e){}});setTimeout(function(){var o=[];L.forEach(function(li){var t=li.querySelector('[class*="pui__vn15t2"]');if(!t)return;var a=li.querySelector('[class*="pui__uslU0d"] [class*="pui__NMi-Dp"]');var d=li.querySelector('[class*="pui__QKE5Pr"] .place_blind');o.push({text:(t.innerText||'').trim(),author:a?a.innerText.trim():'',date:d?d.innerText.trim():'',rating:null})});if(!o.length){alert('리뷰를 못 찾았어요. 리뷰 탭에서 리뷰가 보이게 스크롤한 뒤 다시 눌러주세요.');return}window.open('__APP_ORIGIN__/review#import='+encodeURIComponent(JSON.stringify(o.slice(0,30))),'_blank')},400)})();`;

export default function ReviewImportHelp({ onClose }: { onClose: () => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    // React 가 javascript: href 를 지우므로 ref 로 직접 주입
    if (linkRef.current) {
      linkRef.current.setAttribute('href', BOOKMARKLET_SRC.replace('__APP_ORIGIN__', o));
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center">
      <div className="w-full max-w-md rounded-xl2 border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold">리뷰 자동 가져오기</h2>
          <button onClick={onClose} className="text-ink-soft" aria-label="닫기">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          네이버가 서버 자동수집을 막아서, 대신 <b>내 브라우저</b>에서 리뷰를 가져와요. 처음 한 번만 설정하면 됩니다.
        </p>

        {/* 1) 북마클릿 설치 */}
        <div className="mt-4 rounded-xl2 border border-dashed border-line bg-canvas p-3">
          <p className="text-sm font-semibold">① 아래 버튼을 북마크바로 끌어다 놓기</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            (Ctrl/⌘+Shift+B 로 북마크바를 켠 뒤, 아래 버튼을 마우스로 드래그)
          </p>
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            className="mt-2 inline-flex cursor-grab items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-4 py-2 text-sm font-semibold text-brand active:cursor-grabbing"
          >
            <MousePointerClick size={16} />
            리뷰 가져오기
          </a>
        </div>

        {/* 2) 사용법 */}
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-semibold">② 쓸 때</p>
          <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
            <li>
              위의 <b>&quot;이 지점 리뷰 보러가기&quot;</b> 로 네이버 리뷰 페이지 열기{' '}
              <ExternalLink size={12} className="inline align-[-1px]" />
            </li>
            <li>리뷰가 보이게 아래로 <b>스크롤</b> (더 많이 가져오려면 더 내리기)</li>
            <li>북마크바의 <b>&quot;리뷰 가져오기&quot;</b> 클릭</li>
            <li>이 화면으로 리뷰가 자동으로 들어옵니다 → 눌러서 답글쓰기</li>
          </ol>
        </div>

        <p className="mt-3 text-xs text-ink-soft">
          안 되면 알려주세요. (네이버가 페이지 구조를 바꾸면 버튼을 새로 받아야 할 수 있어요.)
        </p>
        {origin && (
          <p className="mt-1 break-all text-[10px] text-ink-soft/60">보내는 곳: {origin}/review</p>
        )}

        <button onClick={onClose} className="btn-ghost mt-4 w-full">
          닫기
        </button>
      </div>
    </div>
  );
}
