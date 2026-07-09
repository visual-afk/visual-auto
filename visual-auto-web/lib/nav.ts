import {
  PenLine,
  BarChart3,
  Users,
  LayoutGrid,
  Building2,
  Search,
  MessageSquare,
  MapPin,
  PieChart,
  GraduationCap,
  Film,
  FileCog,
  NotebookPen,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/roles';

export type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[] };
export type NavFolder = { key: string; label: string; items: NavItem[] };

const ALL: Role[] = ['hq_admin', 'branch_owner', 'designer', 'intern'];

/** 앱 전체 정보구조(5폴더). 사이드바(PC)·모바일 메뉴가 공유한다. 아이템별 roles로 접근권한 보존. */
export const FOLDERS: NavFolder[] = [
  {
    key: '현황',
    label: '현황',
    items: [
      { href: '/overview', label: '전체 현황', icon: LayoutGrid, roles: ['hq_admin'] },
      { href: '/performance', label: '성과 대시보드', icon: PieChart, roles: ['hq_admin', 'branch_owner'] },
    ],
  },
  {
    key: '콘텐츠',
    label: '콘텐츠',
    items: [
      { href: '/write', label: '글쓰기', icon: PenLine, roles: ALL },
      { href: '/reels', label: '릴스', icon: Film, roles: ALL },
      { href: '/review', label: '리뷰 답글', icon: MessageSquare, roles: ALL },
      { href: '/track', label: '내 글·조회수', icon: BarChart3, roles: ALL },
    ],
  },
  {
    key: '마케팅',
    label: '마케팅',
    items: [
      { href: '/keyword-research', label: '키워드 조사', icon: Search, roles: ['hq_admin'] },
      { href: '/prompts', label: '프롬프트 관리', icon: FileCog, roles: ['hq_admin'] },
    ],
  },
  {
    key: '교육',
    label: '교육',
    items: [{ href: '/academy', label: '아카데미', icon: GraduationCap, roles: ['hq_admin'] }],
  },
  {
    key: '운영',
    label: '운영',
    items: [
      { href: '/branches', label: '지점 관리', icon: Building2, roles: ['hq_admin'] },
      { href: '/members', label: '지점·사람', icon: Users, roles: ['hq_admin', 'branch_owner'] },
      { href: '/journal', label: '업무일지·오픈체크', icon: NotebookPen, roles: ['hq_admin', 'branch_owner'] },
      { href: '/interviews', label: '면담·미팅', icon: HeartHandshake, roles: ['hq_admin', 'branch_owner'] },
      { href: '/attendance', label: '출근 현황', icon: MapPin, roles: ALL },
    ],
  },
];

/** 역할이 볼 수 있는 아이템만 남긴 폴더 목록 (빈 폴더 제거) */
export function foldersFor(role: Role): NavFolder[] {
  return FOLDERS.map((f) => ({ ...f, items: f.items.filter((i) => i.roles.includes(role)) })).filter(
    (f) => f.items.length > 0,
  );
}

/** 역할별 처음 펼쳐지는 폴더 */
export const DEFAULT_OPEN: Record<Role, string> = {
  hq_admin: '현황',
  branch_owner: '운영',
  designer: '콘텐츠',
  intern: '콘텐츠',
};
