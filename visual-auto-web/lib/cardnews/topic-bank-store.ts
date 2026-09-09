/**
 * 주제 은행 조회·저장.
 * 트리필드는 파일 은행(손으로 관리), 나머지 브랜드는 DB 은행(AI 생성 + 손수정).
 * 파일 은행이 항상 우선이라 트리필드 편성은 이 변경의 영향을 받지 않는다.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFileTopicBank, type TopicBank } from './topic-engine';
import { generateTopicBank } from './topic-bank-ai';

export interface StoredBank {
  bank: TopicBank;
  source: 'file' | 'db';
  entryCount: number;
  generatedAt?: string;
}

/** 브랜드의 은행을 가져온다. 없으면 null (AI 생성은 ensureTopicBank 가 한다). */
export async function loadTopicBank(brandName: string, branchId: string): Promise<StoredBank | null> {
  const file = getFileTopicBank(brandName);
  if (file) return { bank: file, source: 'file', entryCount: file.entries.length };

  const admin = getAdminSupabase();
  const { data } = await admin
    .from('cardnews_topic_banks')
    .select('bank, entry_count, generated_at')
    .eq('branch_id', branchId)
    .maybeSingle();
  if (!data?.bank) return null;

  const bank = data.bank as TopicBank;
  // 저장된 JSON이 손상됐으면 없는 것으로 친다 — 편성이 터지는 것보다 낫다
  if (!Array.isArray(bank.entries) || !bank.entries.length || !bank.weekday_pools) return null;
  return {
    bank,
    source: 'db',
    entryCount: bank.entries.length,
    generatedAt: data.generated_at as string | undefined,
  };
}

/** AI로 은행을 만들어 저장한다 (기존 은행이 있으면 덮어쓴다). */
export async function regenerateTopicBank(
  brandName: string,
  branchId: string,
  generatedBy?: string,
): Promise<StoredBank & { warnings: string[] }> {
  const { bank, model, warnings } = await generateTopicBank(brandName, branchId);
  const admin = getAdminSupabase();
  const { error } = await admin.from('cardnews_topic_banks').upsert(
    {
      branch_id: branchId,
      bank,
      entry_count: bank.entries.length,
      model,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(generatedBy ? { generated_by: generatedBy } : {}),
    },
    { onConflict: 'branch_id' },
  );
  if (error) throw new Error(`주제 은행 저장 실패(${brandName}): ${error.message}`);
  return { bank, source: 'db', entryCount: bank.entries.length, warnings };
}

/**
 * 은행이 없으면 AI로 만들어서라도 돌려준다.
 * 크론이 쓴다 — 브랜드를 새로 추가해도 사람이 손대지 않고 편성이 시작되게 하는 지점.
 */
export async function ensureTopicBank(brandName: string, branchId: string): Promise<StoredBank | null> {
  const existing = await loadTopicBank(brandName, branchId);
  if (existing) return existing;
  return await regenerateTopicBank(brandName, branchId);
}
