// 두 좌표 사이 거리(미터) — Haversine. GPS 지오펜스 판정용.

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 위/경도 두 점 사이의 거리(미터). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * 지오펜스 판정. 지점 좌표가 없으면 검증 불가(null) → 통과시키되 표시.
 * GPS 오차(accuracy)만큼 반경에 버퍼를 줘서 실내 측정 오차를 흡수한다.
 */
export function evaluateGeofence(opts: {
  branchLat: number | null | undefined;
  branchLng: number | null | undefined;
  radiusM: number;
  lat: number;
  lng: number;
  accuracyM?: number | null;
}): { distanceM: number | null; within: boolean | null } {
  if (opts.branchLat == null || opts.branchLng == null) {
    return { distanceM: null, within: null };
  }
  const distanceM = distanceMeters(opts.branchLat, opts.branchLng, opts.lat, opts.lng);
  const buffer = Math.min(opts.accuracyM ?? 0, 100); // 오차 버퍼는 최대 100m로 제한
  const within = distanceM - buffer <= opts.radiusM;
  return { distanceM, within };
}
