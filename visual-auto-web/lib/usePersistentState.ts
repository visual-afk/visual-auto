'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * useState와 동일하게 쓰되, 값을 localStorage에 자동 저장/복원한다.
 * 디자이너가 글쓰기·릴스·리뷰답글을 작성하다 새로고침해도 입력이 날아가지 않게 한다.
 * (사진/녹음 같은 파일은 저장 불가 — 텍스트·선택값만 대상으로 쓴다.)
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  // 최초 1회: 저장된 초안이 있으면 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* 손상된 값은 무시 */
    }
    hydrated.current = true;
  }, [key]);

  // 값이 바뀔 때마다 저장(복원 완료 후에만 — 초기값으로 덮어쓰기 방지)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 용량 초과 등은 무시 */
    }
  }, [key, value]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return [value, setValue, clear];
}
