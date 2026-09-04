'use client';

/** 전략실 API 공용 fetch. { ok, error } 반환. */
export async function apiSend(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error || '저장에 실패했어요' };
    return { ok: true };
  } catch {
    return { ok: false, error: '네트워크 오류예요' };
  }
}
