// 근태 이벤트 공용 타입·라벨 (API·클라이언트·페이지 공유).

export type AttendanceEventType = 'check_in' | 'check_out' | 'step_out' | 'return';

export const EVENT_TYPES: AttendanceEventType[] = ['check_in', 'step_out', 'return', 'check_out'];

export const eventLabel: Record<AttendanceEventType, string> = {
  check_in: '출근',
  step_out: '외출',
  return: '복귀',
  check_out: '퇴근',
};

export const GROOM_KEYS = ['nametag', 'radio', 'makeup', 'hair'] as const;
export type GroomKey = (typeof GROOM_KEYS)[number];

export const groomLabel: Record<GroomKey, string> = {
  nametag: '명찰',
  radio: '무전기',
  makeup: '메이크업',
  hair: '헤어',
};

export type AttendanceEvent = {
  id: string;
  member_id: string;
  user_id: string;
  branch_id: string | null;
  display_name: string | null;
  event_type: AttendanceEventType;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  within_geofence: boolean | null;
  groom_nametag: boolean;
  groom_radio: boolean;
  groom_makeup: boolean;
  groom_hair: boolean;
  photo_path: string | null;
  created_at: string;
};

/** 오늘의 마지막 이벤트로부터 다음에 가능한 동작을 계산. */
export function nextActions(lastToday: AttendanceEventType | null): AttendanceEventType[] {
  switch (lastToday) {
    case null:
    case 'check_out':
      return ['check_in']; // 아직 출근 전(또는 퇴근 후) → 출근
    case 'check_in':
    case 'return':
      return ['step_out', 'check_out']; // 근무 중 → 외출/퇴근
    case 'step_out':
      return ['return']; // 외출 중 → 복귀
    default:
      return ['check_in'];
  }
}
