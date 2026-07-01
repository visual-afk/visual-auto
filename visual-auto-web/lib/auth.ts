import { NextResponse } from 'next/server';
import { getServerSupabase } from './supabase/server';
import { getAdminSupabase } from './supabase/admin';

// 역할 상수는 클라이언트 공용 모듈에서 (서버 컴포넌트가 next/headers를 끌어오므로 분리)
export { canManage, roleLabel, type Role } from './roles';
import type { Role } from './roles';

export interface MemberContext {
  userId: string;
  memberId: string;
  displayName: string;
  phone: string | null; // 휴대폰(=로그인 아이디). 워터마크 식별자에 뒷4자리 사용
  role: Role;
  isActive: boolean;
  branchId: string | null;
  branchName: string | null;
  region: string | null;
  naverBlogUrl: string | null; // 지점 공용 네이버(레거시/폴백)
  imwebUrl: string | null; // 지점 공용 아임웹 (발행 '아임웹 열기' 대상)
  myNaverUrl: string | null; // 본인 개인 네이버 블로그 글쓰기 링크 (사람별 발행 대상)
}

/** 현재 세션의 멤버 + 지점 정보를 한 번에. 미인증/멤버아님이면 null. */
export async function getMember(): Promise<MemberContext | null> {
  const supabase = await getServerSupabase();
  // 미들웨어가 매 요청 getUser()로 토큰을 이미 검증하므로, 여기선 쿠키의 세션을
  // 로컬에서 읽어 네트워크 왕복 1회를 줄인다 (서명된 JWT의 sub만 사용).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  // 멤버/지점 조인은 RLS 영향 없이 확실히 읽기 위해 admin 사용 (본인 행만 조회)
  const admin = getAdminSupabase();
  const { data: member } = await admin
    .from('branch_users')
    .select('id, display_name, phone, role, is_active, branch_id, branches(name, region, naver_blog_url, imweb_url)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) return null;
  // 퇴출(비활성)된 계정은 멤버 아님으로 취급 → 앱 접근 차단
  if (member.is_active === false) return null;
  const branch = (member.branches as any) || null;

  // 본인 개인 네이버 블로그 링크 (별도 best-effort 조회 — 컬럼 마이그레이션 전이어도 앱이 안 깨지게)
  const { data: blogRow } = await admin
    .from('branch_users')
    .select('naver_blog_url')
    .eq('user_id', user.id)
    .maybeSingle();
  const myNaverUrl = (blogRow as { naver_blog_url?: string | null } | null)?.naver_blog_url ?? null;

  return {
    userId: user.id,
    memberId: member.id,
    displayName: member.display_name,
    phone: (member as { phone?: string | null }).phone ?? null,
    role: member.role as Role,
    isActive: member.is_active,
    branchId: member.branch_id,
    branchName: branch?.name ?? null,
    region: branch?.region ?? null,
    naverBlogUrl: branch?.naver_blog_url ?? null,
    imwebUrl: branch?.imweb_url ?? null,
    myNaverUrl,
  };
}

/** 라우트 핸들러용: 멤버 반환 or 401 NextResponse */
export async function requireMember(): Promise<
  { member: MemberContext } | { error: NextResponse }
> {
  const member = await getMember();
  if (!member) {
    return { error: NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 }) };
  }
  return { member };
}
