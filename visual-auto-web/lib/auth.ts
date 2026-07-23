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
  branchId: string | null; // 홈/기본 지점 (신원 표시·기본 선택값)
  branchName: string | null;
  branchIds: string[]; // 활동 가능한 전체 지점 (홈 ∪ member_branches). 본사는 [] (전 지점)
  branchNames: string[]; // branchIds에 대응하는 지점 이름 (홈 지점 먼저). 겸직자 화면 표시용
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

  // 활동 가능한 전체 지점 (홈 ∪ member_branches). best-effort: 테이블 없기 전에도 안 깨지게.
  let branchIds: string[] = member.branch_id ? [member.branch_id] : [];
  const branchNames: string[] = branch?.name ? [branch.name] : [];
  const { data: mbRows, error: mbError } = await admin
    .from('member_branches')
    .select('branch_id, branches(name)')
    .eq('user_id', user.id);
  if (mbError) console.error('[auth] member_branches 조회 실패 (홈 지점만 노출됨):', mbError.message);
  if (mbRows && mbRows.length > 0) {
    const set = new Set<string>(branchIds);
    for (const r of mbRows) {
      if (!r.branch_id || set.has(r.branch_id)) continue;
      set.add(r.branch_id);
      const rb = (r.branches as any) || null; // 임베드가 객체/배열 어느 쪽으로 와도 이름만 뽑는다
      const name = Array.isArray(rb) ? rb[0]?.name : rb?.name;
      if (name) branchNames.push(name);
    }
    branchIds = [...set];
  }

  return {
    userId: user.id,
    memberId: member.id,
    displayName: member.display_name,
    phone: (member as { phone?: string | null }).phone ?? null,
    role: member.role as Role,
    isActive: member.is_active,
    branchId: member.branch_id,
    branchName: branch?.name ?? null,
    branchIds,
    branchNames,
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

/** 라우트 핸들러용: 본사만 — 그 외 403. (라우트마다 복사하지 말 것) */
export async function requireHq(): Promise<{ member: MemberContext } | { error: NextResponse }> {
  const res = await requireMember();
  if ('error' in res) return res;
  if (res.member.role !== 'hq_admin') {
    return { error: NextResponse.json({ error: '본사만 접근할 수 있어요' }, { status: 403 }) };
  }
  return res;
}

/** 이 멤버가 해당 지점에서 행동할 수 있나? (본사 = 전 지점 / 그 외 = 소속 지점 집합) */
export function canActOnBranch(member: MemberContext, branchId: string | null | undefined): boolean {
  if (!branchId) return false;
  if (member.role === 'hq_admin') return true;
  return member.branchIds.includes(branchId);
}

/** 여러 지점 소속인가? (본사 or 활동 지점 2개 이상 → 글쓰기 등에서 지점 선택 필요) */
export function isMultiBranch(member: MemberContext): boolean {
  return member.role === 'hq_admin' || member.branchIds.length > 1;
}

/**
 * 글쓰기/생성 계열에서 "어느 지점으로 쓸지" 결정.
 * - 본사 or 멀티 지점: body.branch_id 필수 + 소속(본사는 전체) 검증
 * - 단일 지점: 홈 지점 기본값
 */
export async function resolveWriteBranch(
  member: MemberContext,
  bodyBranchId: string | null | undefined,
): Promise<{ branchId: string; branchName: string | null } | { error: NextResponse }> {
  if (isMultiBranch(member)) {
    if (!bodyBranchId) {
      return { error: NextResponse.json({ error: '어느 지점으로 할지 골라주세요' }, { status: 400 }) };
    }
    if (!canActOnBranch(member, bodyBranchId)) {
      return { error: NextResponse.json({ error: '소속되지 않은 지점이에요' }, { status: 403 }) };
    }
    const { data: b } = await getAdminSupabase()
      .from('branches')
      .select('id, name')
      .eq('id', bodyBranchId)
      .maybeSingle();
    if (!b) return { error: NextResponse.json({ error: '지점을 찾을 수 없어요' }, { status: 400 }) };
    return { branchId: b.id, branchName: b.name };
  }
  if (!member.branchId) {
    return { error: NextResponse.json({ error: '지점이 없는 계정이에요' }, { status: 400 }) };
  }
  return { branchId: member.branchId, branchName: member.branchName };
}
