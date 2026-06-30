// 한국 시간(KST, UTC+9) 기준 날짜/시각 헬퍼. 출근 기록의 "오늘"·"이번 달" 경계 계산용.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 오늘 날짜(KST) 'YYYY-MM-DD'. */
export function kstTodayStr(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 이번 달(KST) 'YYYY-MM'. */
export function kstThisMonth(): string {
  return kstTodayStr().slice(0, 7);
}

/** KST 하루의 [시작, 끝) 을 UTC ISO 로. dateStr 없으면 오늘. */
export function kstDayRangeUtc(dateStr?: string): { gte: string; lt: string } {
  const day = dateStr ?? kstTodayStr();
  const start = new Date(`${day}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

/** KST 한 달의 [시작, 끝) 을 UTC ISO 로. month 없으면 이번 달. */
export function kstMonthRangeUtc(month?: string): { gte: string; lt: string } {
  const m = month ?? kstThisMonth();
  const [y, mo] = m.split('-').map(Number);
  const nextY = mo === 12 ? y + 1 : y;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const start = new Date(`${m}-01T00:00:00+09:00`);
  const end = new Date(`${nextY}-${String(nextMo).padStart(2, '0')}-01T00:00:00+09:00`);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

/** UTC ISO → KST 'HH:mm'. */
export function kstTimeHHmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** UTC ISO → KST 'M/D HH:mm'. */
export function kstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
