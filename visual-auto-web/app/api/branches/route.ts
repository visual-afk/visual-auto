import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';

/** 숫자로 파싱, 비거나 NaN이면 null */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 지점 관리는 본사 전용 */
async function requireHq() {
  const res = await requireMember();
  if ('error' in res) return { error: res.error };
  if (res.member.role !== 'hq_admin') {
    return { error: NextResponse.json({ error: '본사만 지점을 관리할 수 있어요' }, { status: 403 }) };
  }
  return { member: res.member };
}

/** 지점 목록 + 멤버수·글수 (삭제 가능 여부 표시용) */
export async function GET() {
  const res = await requireHq();
  if ('error' in res) return res.error;

  const admin = getAdminSupabase();
  const [{ data: branches }, { data: members }, { data: posts }] = await Promise.all([
    admin.from('branches').select('id, name, region, knowledge_slug, naver_blog_url, imweb_url, lat, lng, geofence_radius_m').order('name'),
    admin.from('branch_users').select('branch_id'),
    admin.from('posts').select('branch_id'),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of members ?? []) if (m.branch_id) memberCount.set(m.branch_id, (memberCount.get(m.branch_id) || 0) + 1);
  const postCount = new Map<string, number>();
  for (const p of posts ?? []) if (p.branch_id) postCount.set(p.branch_id, (postCount.get(p.branch_id) || 0) + 1);

  const rows = (branches ?? []).map((b) => ({
    ...b,
    member_count: memberCount.get(b.id) || 0,
    post_count: postCount.get(b.id) || 0,
  }));
  return NextResponse.json({ branches: rows });
}

/** 지점 생성 (본사 전용) */
export async function POST(request: Request) {
  const res = await requireHq();
  if ('error' in res) return res.error;

  const body = await request.json().catch(() => ({}));
  const name: string = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: '지점 이름을 입력해주세요' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('branches')
    .insert({
      name,
      region: (body.region || '').trim() || null,
      knowledge_slug: (body.knowledge_slug || '').trim() || null,
      naver_blog_url: (body.naver_blog_url || '').trim() || null,
      imweb_url: (body.imweb_url || '').trim() || null,
      lat: numOrNull(body.lat),
      lng: numOrNull(body.lng),
      geofence_radius_m: numOrNull(body.geofence_radius_m) ?? 200,
    })
    .select('id')
    .single();
  if (error) {
    const msg = error.code === '23505' ? '같은 이름의 지점이 이미 있어요' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
