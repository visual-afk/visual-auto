import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/** 본사(hq_admin) 계정을 휴대폰 번호로 바로 생성. 실행: npx tsx scripts/add-admins.ts */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const domain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || 'visual.local';
const PW = 'visual1234';

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const ADMINS = [
  { phone: '01039687452', name: '대표님' },
  { phone: '01055360442', name: '본부장' },
  { phone: '01031459382', name: '실장님' },
];

function emailOf(phone: string) {
  const safe = phone.replace(/[^0-9]/g, '');
  return `${safe}@${domain}`;
}

async function findUserByEmail(email: string) {
  // 페이지를 돌며 검색
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email === email);
    if (u) return u.id;
    if (!data || data.users.length < 200) break;
  }
  return null;
}

async function main() {
  for (const a of ADMINS) {
    const phone = a.phone.replace(/[^0-9]/g, '');
    const email = emailOf(phone);

    let userId = await findUserByEmail(email);
    if (userId) {
      // 비번 재설정 (요청한 비번으로 보장)
      await admin.auth.admin.updateUserById(userId, { password: PW });
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PW,
        email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) {
        console.error(`❌ ${a.name}(${phone}) 생성 실패:`, error.message);
        continue;
      }
      userId = data.user.id;
    }

    const { error: mErr } = await admin.from('branch_users').upsert(
      {
        user_id: userId,
        branch_id: null, // 본사 = 전 지점
        display_name: a.name,
        phone,
        login_id: phone,
        role: 'hq_admin',
      },
      { onConflict: 'user_id' },
    );
    if (mErr) {
      console.error(`❌ ${a.name} 멤버 등록 실패:`, mErr.message);
      continue;
    }
    console.log(`✅ ${a.name}  아이디: ${phone} / 비번: ${PW}  (본사·전 지점)`);
  }
  console.log('\n완료. 위 아이디·비번으로 바로 로그인하세요.');
}

main().catch((e) => {
  console.error('실패:', e.message || e);
  process.exit(1);
});
