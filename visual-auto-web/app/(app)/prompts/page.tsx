import { redirect } from 'next/navigation';
import { getMember } from '@/lib/auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { buildCatalog, readFileDefault } from '@/lib/generation/catalog';
import PromptManager, { type CatalogEntry } from '@/components/PromptManager';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  const me = (await getMember())!;
  if (me.role !== 'hq_admin') redirect('/');

  const admin = getAdminSupabase();
  const [{ data: branchesData }, { data: overrides }] = await Promise.all([
    admin.from('branches').select('id, name').order('name'),
    admin.from('content_overrides').select('kind, slug, content, updated_at').is('branch_id', null),
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

  return (
    <div className="py-6 md:py-0">
      <h1 className="text-2xl font-bold">프롬프트 관리</h1>
      <p className="mt-1 text-sm text-ink-soft">
        AI 글쓰기·릴스·리뷰 답글에 쓰이는 프롬프트와 지식베이스를 직접 고칠 수 있어요. 저장하면 바로 반영돼요.
      </p>
      <PromptManager branches={branches} initialItems={items} />
    </div>
  );
}
