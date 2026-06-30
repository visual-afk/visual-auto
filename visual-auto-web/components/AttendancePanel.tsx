'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Camera, Check, LogIn, LogOut, DoorOpen, Undo2, type LucideIcon } from 'lucide-react';
import {
  type AttendanceEventType,
  eventLabel,
  GROOM_KEYS,
  groomLabel,
  nextActions,
} from '@/lib/attendance';

const ICONS: Record<AttendanceEventType, LucideIcon> = {
  check_in: LogIn,
  step_out: DoorOpen,
  return: Undo2,
  check_out: LogOut,
};

type Result = { ok: true; text: string } | { ok: false; text: string };

/** 현재 위치 1회 측정 (Promise 래핑). */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('이 기기에서는 위치를 쓸 수 없어요.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function geoErrorMessage(err: unknown): string {
  const code = (err as GeolocationPositionError)?.code;
  if (code === 1) return '위치 권한을 허용해주세요. (설정 → 위치)';
  if (code === 2) return '위치를 찾지 못했어요. 잠시 후 다시 시도해주세요.';
  if (code === 3) return '위치 확인이 오래 걸려요. 다시 시도해주세요.';
  return (err as Error)?.message || '위치를 확인하지 못했어요.';
}

export default function AttendancePanel({ lastToday }: { lastToday: AttendanceEventType | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<AttendanceEventType | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 출근 시트 상태
  const [groom, setGroom] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const actions = nextActions(lastToday);
  const allGroomed = GROOM_KEYS.every((k) => groom[k]);

  async function submit(eventType: AttendanceEventType, extra?: FormData) {
    setBusy(eventType);
    setResult(null);
    try {
      const pos = await getPosition();
      const fd = extra ?? new FormData();
      fd.set('event_type', eventType);
      fd.set('lat', String(pos.coords.latitude));
      fd.set('lng', String(pos.coords.longitude));
      if (pos.coords.accuracy != null) fd.set('accuracy', String(pos.coords.accuracy));

      const res = await fetch('/api/attendance', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: data.error || '처리에 실패했어요.' });
        return;
      }
      const dist = data.distance_m != null ? ` · 지점에서 ${data.distance_m}m` : '';
      setResult({ ok: true, text: `${eventLabel[eventType]} 완료 ${data.time}${dist}` });
      setSheetOpen(false);
      setGroom({});
      setPhoto(null);
      router.refresh();
    } catch (err) {
      setResult({ ok: false, text: geoErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  function onAction(eventType: AttendanceEventType) {
    if (eventType === 'check_in') {
      setResult(null);
      setSheetOpen(true);
      return;
    }
    submit(eventType);
  }

  function submitCheckIn() {
    const fd = new FormData();
    for (const k of GROOM_KEYS) fd.set(`groom_${k}`, groom[k] ? 'true' : 'false');
    if (photo) fd.set('photo', photo);
    submit('check_in', fd);
  }

  return (
    <section className="rounded-xl2 border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <MapPin size={16} className="text-brand" /> 출근 체크
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => {
          const Icon = ICONS[a];
          const primary = a === 'check_in' || a === 'return';
          return (
            <button
              key={a}
              onClick={() => onAction(a)}
              disabled={busy !== null}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-bold transition active:scale-[0.99] disabled:opacity-50 ${
                primary
                  ? 'bg-brand text-brand-ink'
                  : 'border border-line bg-canvas text-ink-soft'
              }`}
            >
              <Icon size={18} />
              {busy === a ? '확인 중…' : eventLabel[a]}
            </button>
          );
        })}
      </div>

      {result && (
        <p
          className={`mt-3 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm ${
            result.ok ? 'bg-brand-wash text-brand' : 'bg-red-50 text-red-600'
          }`}
        >
          {result.ok && <Check size={15} />}
          {result.text}
        </p>
      )}

      {/* 출근 시트 — 그루밍 체크 + 사진 */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center" role="dialog">
          <div className="w-full max-w-phone rounded-t-3xl bg-surface p-5 md:rounded-3xl">
            <h2 className="text-lg font-bold">출근 준비 확인</h2>
            <p className="mt-1 text-sm text-ink-soft">단정한 출근 상태를 확인하고 사진을 남겨요.</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {GROOM_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGroom((g) => ({ ...g, [k]: !g[k] }))}
                  className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3.5 text-base font-semibold transition ${
                    groom[k] ? 'bg-brand text-brand-ink' : 'border border-line bg-canvas text-ink-soft'
                  }`}
                >
                  <Check size={16} className={groom[k] ? '' : 'opacity-30'} />
                  {groomLabel[k]}
                </button>
              ))}
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-canvas px-4 py-4 text-sm font-semibold text-ink-soft">
              <Camera size={18} className="text-brand" />
              {photo ? '사진 다시 찍기' : '출근 사진 촬영'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={URL.createObjectURL(photo)} alt="출근 사진" className="mt-2 h-32 w-full rounded-2xl object-cover" />
            )}

            {result && !result.ok && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{result.text}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setSheetOpen(false);
                  setResult(null);
                }}
                disabled={busy !== null}
                className="rounded-2xl border border-line px-4 py-3.5 text-base font-semibold text-ink-soft"
              >
                취소
              </button>
              <button
                onClick={submitCheckIn}
                disabled={busy !== null || !allGroomed || !photo}
                className="flex-1 rounded-2xl bg-brand px-4 py-3.5 text-base font-bold text-brand-ink disabled:opacity-50"
              >
                {busy === 'check_in' ? '출근 처리 중…' : '출근하기'}
              </button>
            </div>
            {(!allGroomed || !photo) && (
              <p className="mt-2 text-center text-xs text-ink-faint">
                4가지 모두 확인하고 사진을 찍으면 출근할 수 있어요
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
