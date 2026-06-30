import { getAdminSupabase } from '@/lib/supabase/admin';

/** 콘텐츠 프로필 (매장 톤·지역 = 지점 / 고객·캐릭터 = 디자이너) */
export interface ContentProfile {
  tone: string | null;
  regionTarget: string | null;
  persona: Record<string, unknown>;
  character: Record<string, unknown>;
}

export async function getContentProfile(userId: string, branchId: string | null): Promise<ContentProfile> {
  const admin = getAdminSupabase();
  const [{ data: branch }, { data: prof }] = await Promise.all([
    branchId
      ? admin.from('branches').select('tone, region_target').eq('id', branchId).maybeSingle()
      : Promise.resolve({ data: null } as { data: { tone: string | null; region_target: string | null } | null }),
    admin.from('designer_profiles').select('persona, character').eq('user_id', userId).maybeSingle(),
  ]);
  return {
    tone: (branch as { tone?: string | null } | null)?.tone ?? null,
    regionTarget: (branch as { region_target?: string | null } | null)?.region_target ?? null,
    persona: (prof?.persona as Record<string, unknown>) || {},
    character: (prof?.character as Record<string, unknown>) || {},
  };
}

/** 프롬프트 주입용 마크다운 */
export function compileProfileContext(p: ContentProfile): string {
  const lines: string[] = [];
  if (p.tone || p.regionTarget) lines.push(`매장 톤·지역: ${[p.regionTarget, p.tone].filter(Boolean).join(' / ') || '(미설정)'}`);
  const persona = Object.values(p.persona).filter(Boolean);
  if (persona.length) lines.push(`내 고객: ${persona.join(', ')}`);
  const ch = p.character as { type?: string; oneLiner?: string; strengths?: string[] };
  const chParts = [ch.type, ch.oneLiner, ...(ch.strengths || [])].filter(Boolean);
  if (chParts.length) lines.push(`내 캐릭터: ${chParts.join(' / ')}`);
  return lines.join('\n');
}
