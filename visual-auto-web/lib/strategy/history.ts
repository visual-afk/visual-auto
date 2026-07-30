import type { SupabaseClient } from '@supabase/supabase-js';

/** 변경 이력 기록 (best-effort — 실패해도 본 작업은 진행). */
export async function logEdits(
  admin: SupabaseClient,
  entityType: string,
  entityId: string,
  editedBy: string,
  changes: { field: string; oldValue: unknown; newValue: unknown }[],
) {
  const rows = changes
    .filter((c) => String(c.oldValue ?? '') !== String(c.newValue ?? ''))
    .map((c) => ({
      entity_type: entityType,
      entity_id: entityId,
      field: c.field,
      old_value: c.oldValue == null ? null : String(c.oldValue),
      new_value: c.newValue == null ? null : String(c.newValue),
      edited_by: editedBy,
    }));
  if (rows.length === 0) return;
  try {
    await admin.from('strategy_edit_history').insert(rows);
  } catch {
    /* 이력 실패는 무시 */
  }
}
