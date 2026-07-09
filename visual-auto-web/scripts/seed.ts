import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * 초기 시드: 지점 5개 + 본사(hq_admin) 1명 + 지점별 원장(branch_owner) 1명.
 * 이후 디자이너는 원장이 초대 링크로 가입시킨다.
 *
 * 실행: npm run seed   (.env 에 SUPABASE URL/SERVICE_ROLE_KEY 필요)
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const domain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || 'visual.local';
const DEFAULT_PW = 'visual1234'; // ⚠️ 시드용. 첫 로그인 후 변경 권장

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function emailOf(loginId: string) {
  const safe = loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${safe}@${domain}`;
}

const BRANCHES = [
  { name: '성수점', region: '서울 성동구', slug: '성수점' },
  { name: '마곡나루점', region: '서울 강서구', slug: '마곡나루점' },
  { name: '강남신사점', region: '서울 강남구', slug: '강남신사점' },
  { name: '사가정점', region: '서울 중랑구', slug: '사가정점' },
  { name: '서면전포점', region: '부산 부산진구', slug: '서면전포점' },
];

// 글쓰기 전용 브랜드 (kind='brand') — 운영 대시보드에는 안 나오고 콘텐츠 화면에만 노출
const BRANDS = ['아카데미', '트리필드', '누혜', '비주얼살롱'];

async function ensureUser(loginId: string, displayName: string) {
  const email = emailOf(loginId);
  // 이미 있으면 재사용
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PW,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  return data.user.id;
}

async function upsertMember(opts: {
  userId: string;
  branchId: string | null;
  displayName: string;
  loginId: string;
  role: string;
}) {
  await admin.from('branch_users').upsert(
    {
      user_id: opts.userId,
      branch_id: opts.branchId,
      display_name: opts.displayName,
      login_id: opts.loginId,
      phone: opts.loginId,
      role: opts.role,
    },
    { onConflict: 'user_id' },
  );
}

async function main() {
  console.log('🌱 시드 시작\n');

  // 1) 지점
  const branchIds: Record<string, string> = {};
  for (const b of BRANCHES) {
    const { data, error } = await admin
      .from('branches')
      .upsert(
        {
          name: b.name,
          region: b.region,
          knowledge_slug: b.slug,
          naver_blog_url: `https://blog.naver.com/visualsalon_${b.slug}`,
          imweb_url: `https://visualsalon.imweb.me/${b.slug}`,
        },
        { onConflict: 'name' },
      )
      .select('id')
      .single();
    if (error) throw error;
    branchIds[b.name] = data.id;
    console.log(`  🏪 ${b.name} (${b.region})`);
  }

  // 1-2) 글쓰기 전용 브랜드
  for (const name of BRANDS) {
    const { error } = await admin
      .from('branches')
      .upsert({ name, kind: 'brand', knowledge_slug: name }, { onConflict: 'name' });
    if (error) throw error;
    console.log(`  ✍️ ${name} (글쓰기 전용 브랜드)`);
  }

  // 2) 본사 hq_admin
  const hqId = await ensureUser('hq', '본사 관리자');
  await upsertMember({ userId: hqId, branchId: null, displayName: '본사 관리자', loginId: 'hq', role: 'hq_admin' });
  console.log(`\n  👑 본사 관리자  로그인아이디: hq / 비번: ${DEFAULT_PW}`);

  // 3) 지점별 원장
  console.log('\n  지점 원장 계정:');
  let n = 1;
  for (const b of BRANCHES) {
    const loginId = `owner${n}`; // 시드용 단순 아이디. 실제론 원장 휴대폰으로 교체
    const uid = await ensureUser(loginId, `${b.name} 원장`);
    await upsertMember({
      userId: uid,
      branchId: branchIds[b.name],
      displayName: `${b.name} 원장`,
      loginId,
      role: 'branch_owner',
    });
    console.log(`    🧑‍💼 ${b.name} 원장  아이디: ${loginId} / 비번: ${DEFAULT_PW}`);
    n++;
  }

  console.log('\n✅ 시드 완료. 원장으로 로그인 → 디자이너 초대하세요.');
}

main().catch((e) => {
  console.error('❌ 시드 실패:', e.message || e);
  process.exit(1);
});
