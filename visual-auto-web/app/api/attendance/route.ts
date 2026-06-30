import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { evaluateGeofence } from '@/lib/geo';
import { kstDayRangeUtc, kstMonthRangeUtc, kstTimeHHmm } from '@/lib/kst';
import { sendCheckInAlimtalk } from '@/lib/notifications/attendance';
import type { AttendanceEvent, AttendanceEventType } from '@/lib/attendance';

const VALID_TYPES: AttendanceEventType[] = ['check_in', 'check_out', 'step_out', 'return'];
const BUCKET = 'attendance-photos';

/**
 * 출근/퇴근/외출/복귀 기록.
 * - GPS 위치를 지점 반경과 대조해 범위 밖이면 422(기록 안 함).
 * - 출근(check_in)은 그루밍 4종 체크 + 사진 필수.
 */
export async function POST(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: '요청 형식이 올바르지 않아요' }, { status: 400 });

  const eventType = String(form.get('event_type') || '') as AttendanceEventType;
  if (!VALID_TYPES.includes(eventType)) {
    return NextResponse.json({ error: '알 수 없는 동작이에요' }, { status: 400 });
  }

  const lat = Number(form.get('lat'));
  const lng = Number(form.get('lng'));
  const accuracy = form.get('accuracy') != null ? Number(form.get('accuracy')) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '위치를 확인하지 못했어요. 위치 권한을 허용해주세요.' }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 지점 좌표 조회 → 지오펜스 판정
  let branchLat: number | null = null;
  let branchLng: number | null = null;
  let radiusM = 200;
  let branchName: string | null = member.branchName;
  if (member.branchId) {
    const { data: branch } = await admin
      .from('branches')
      .select('name, lat, lng, geofence_radius_m')
      .eq('id', member.branchId)
      .maybeSingle();
    if (branch) {
      branchLat = branch.lat != null ? Number(branch.lat) : null;
      branchLng = branch.lng != null ? Number(branch.lng) : null;
      radiusM = branch.geofence_radius_m ?? 200;
      branchName = branch.name ?? branchName;
    }
  }

  const { distanceM, within } = evaluateGeofence({
    branchLat,
    branchLng,
    radiusM,
    lat,
    lng,
    accuracyM: accuracy,
  });

  // 지점 좌표가 설정돼 있는데 범위 밖이면 기록하지 않고 막는다(강제)
  if (within === false) {
    const m = distanceM != null ? Math.round(distanceM) : null;
    return NextResponse.json(
      {
        error: m != null
          ? `지점에서 약 ${m}m 떨어져 있어요. 지점 근처에서 다시 시도해주세요.`
          : '지점 범위를 벗어났어요. 지점 근처에서 다시 시도해주세요.',
        out_of_range: true,
        distance_m: m,
      },
      { status: 422 },
    );
  }

  // 출근 전용 검증 — 그루밍 4종 + 사진 필수
  const groom = {
    nametag: form.get('groom_nametag') === 'true',
    radio: form.get('groom_radio') === 'true',
    makeup: form.get('groom_makeup') === 'true',
    hair: form.get('groom_hair') === 'true',
  };
  const photo = form.get('photo');
  let photoPath: string | null = null;

  if (eventType === 'check_in') {
    if (!groom.nametag || !groom.radio || !groom.makeup || !groom.hair) {
      return NextResponse.json(
        { error: '명찰·무전기·메이크업·헤어를 모두 확인해주세요.' },
        { status: 422 },
      );
    }
    if (!(photo instanceof File) || photo.size === 0) {
      return NextResponse.json({ error: '출근 사진을 첨부해주세요.' }, { status: 422 });
    }
    // 사진 업로드 (비공개 버킷, 서버 admin)
    const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const key = `${member.branchId || 'nobranch'}/${member.memberId}/${Date.now()}.${ext}`;
    const buf = Buffer.from(await photo.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(key, buf, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (upErr) {
      return NextResponse.json({ error: '사진 업로드에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
    }
    photoPath = key;
  }

  const { data: event, error: insErr } = await admin
    .from('attendance_events')
    .insert({
      member_id: member.memberId,
      user_id: member.userId,
      branch_id: member.branchId,
      display_name: member.displayName,
      event_type: eventType,
      lat,
      lng,
      accuracy_m: accuracy,
      distance_m: distanceM,
      within_geofence: within,
      groom_nametag: eventType === 'check_in' ? groom.nametag : false,
      groom_radio: eventType === 'check_in' ? groom.radio : false,
      groom_makeup: eventType === 'check_in' ? groom.makeup : false,
      groom_hair: eventType === 'check_in' ? groom.hair : false,
      photo_path: photoPath,
    })
    .select('id, event_type, created_at')
    .single();

  if (insErr || !event) {
    return NextResponse.json({ error: '기록에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
  }

  // 출근 시 점장/본사에 카카오 알림 (best-effort)
  if (eventType === 'check_in') {
    void sendCheckInAlimtalk({
      branchId: member.branchId,
      branchName,
      displayName: member.displayName,
      time: kstTimeHHmm(event.created_at),
    });
  }

  return NextResponse.json({
    ok: true,
    event_type: eventType,
    distance_m: distanceM != null ? Math.round(distanceM) : null,
    within_geofence: within,
    time: kstTimeHHmm(event.created_at),
  });
}

/**
 * 기록 조회. scope=me(본인)|team(지점)|all(본사). period=today|month.
 * RLS가 가시 범위를 강제하므로 admin 없이 서버 세션 클라이언트로 읽어도 되지만,
 * 사진 서명 URL 생성을 위해 admin 사용 + scope 필터를 명시적으로 건다.
 */
export async function GET(request: Request) {
  const res = await requireMember();
  if ('error' in res) return res.error;
  const { member } = res;

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'me';
  const period = url.searchParams.get('period') || 'today';
  const month = url.searchParams.get('month') || undefined;

  const range = period === 'month' ? kstMonthRangeUtc(month) : kstDayRangeUtc();

  const admin = getAdminSupabase();
  let query = admin
    .from('attendance_events')
    .select('*')
    .gte('created_at', range.gte)
    .lt('created_at', range.lt)
    .order('created_at', { ascending: false });

  // scope별 가시 범위 — 권한 밖 요청은 자기 것으로 강등
  if (scope === 'all' && member.role === 'hq_admin') {
    // 전체 (필터 없음)
  } else if (scope === 'team' && (member.role === 'branch_owner' || member.role === 'hq_admin') && member.branchId) {
    query = query.eq('branch_id', member.branchId);
  } else {
    query = query.eq('member_id', member.memberId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data ?? []) as AttendanceEvent[];

  // 지점 이름 매핑 (본사 전체 보기에서 지점 표시용)
  const branchIds = [...new Set(events.map((e) => e.branch_id).filter(Boolean))] as string[];
  const branchName = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches } = await admin.from('branches').select('id, name').in('id', branchIds);
    for (const b of branches ?? []) branchName.set(b.id, b.name);
  }

  // 사진 서명 URL (1시간) — 본사/점장만 의미 있음, 없으면 null
  const withPhotos = await Promise.all(
    events.map(async (e) => {
      let photo_url: string | null = null;
      if (e.photo_path) {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(e.photo_path, 60 * 60);
        photo_url = signed?.signedUrl ?? null;
      }
      return { ...e, photo_url, branch_name: e.branch_id ? branchName.get(e.branch_id) ?? null : null };
    }),
  );

  return NextResponse.json({ events: withPhotos });
}
