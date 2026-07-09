'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * MediaRecorder 훅 — 업무일지 음성 구술(짧은 메모)과 개인면담 녹음(긴 대화) 공용.
 * stop() 이 Blob(audio/webm;opus)을 돌려준다. iOS 사파리는 mp4 폴백.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start(1000); // 1초 단위 청크 — 탭 크래시에도 손실 최소화
    recRef.current = rec;
    setSeconds(0);
    setRecording(true);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === 'inactive') {
        setRecording(false);
        resolve(null);
        return;
      }
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type }));
      };
      rec.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRecording(false);
    });
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  return { recording, seconds, start, stop };
}

/** 초 → 'M:SS' */
export function fmtSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Blob → base64 (data: 접두어 제거) */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
