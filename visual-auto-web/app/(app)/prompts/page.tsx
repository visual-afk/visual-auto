import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { buildCatalog, readFileDefault } from '@/lib/generation/catalog';
import PromptManager, { type CatalogEntry } from '@/components/PromptManager';
import CardFrameManager, { type FrameEntry } from '@/components/CardFrameManager';
import type { CardFrameTokens } from '@/lib/cardnews/frames';
import type { CardNewsMode } from '@/lib/cardnews/cards';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const admin = getAdminSupabase();
  const [{ data: branchesData }, { data: overrides }, { data: frameRows }] = await Promise.all([
    admin.from('branches').select('id, name, kind').order('name'),
    admin.from('content_overrides').select('kind, slug, content, updated_at').is('branch_id', null),
    admin.from('card_frames').select('branch_id, mode, tokens'),
  ]);

  const byKey = new Map((overrides ?? []).map((o) => [`${o.kind}:${o.slug}`, o]));
  const items: CatalogEntry[] = buildCatalog().map((c) => {
    const ov = byKey.get(`${c.kind}:${c.slug}`);
    return {
      ...c,
      fileDefault: readFileDefault(c.kind, c.slug),
      override: ov ? ov.content : null,
      updatedAt: ov ? ov.updated_at : null,
    };
  });

  const branches = (branchesData ?? []).map((b) => ({ id: b.id, name: b.name }));

  // 카드뉴스 프레임: 지점 기본(null) + 브랜드별 — 행이 없으면 기본값으로 만들어 보여준다
  const frameByBranch = new Map((frameRows ?? []).map((f) => [f.branch_id ?? 'default', f]));
  const defaultTokens: CardFrameTokens = {
    bg: '#FFFFFF', surface: '#EEF2FB', ink: '#1D1D22', point: '#5B7FD4', logoText: '', ctaBg: '#1D1D22', ctaInk: '#FFFFFF',
  };
  const toEntry = (branchId: string | null, branchName: string): FrameEntry => {
    const row = frameByBranch.get(branchId ?? 'default');
    return {
      branchId,
      branchName,
      mode: ((row?.mode as CardNewsMode) ?? 'info'),
      tokens: { ...defaultTokens, ...((row?.tokens as CardFrameTokens) ?? {}) },
    };
  };
  const frames: FrameEntry[] = [
    toEntry(null, '지점 블로그 (공통)'),
    ...(branchesData ?? []).filter((b) => b.kind === 'brand').map((b) => toEntry(b.id, b.name)),
  ];

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">프롬프트 관리</h1>
      <p className="mt-1 text-sm text-ink-soft">
        AI 글쓰기·릴스·리뷰 답글에 쓰이는 프롬프트와 지식베이스를 직접 고칠 수 있어요. 저장하면 바로 반영돼요.
      </p>
      <PromptManager branches={branches} initialItems={items} />

      <h2 className="mt-10 text-xl font-bold">카드뉴스 프레임</h2>
      <p className="mt-1 text-sm text-ink-soft">
        브랜드별 카드 디자인(컬러·로고·모드)이에요. 저장하면 다음 카드뉴스부터 바로 적용돼요.
      </p>
      <CardFrameManager initialFrames={frames} />
    </div>
  );
}
