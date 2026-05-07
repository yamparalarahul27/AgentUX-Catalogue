import { supabase } from '../supabase';
import type { ScreenshotLabel } from './types';

// Read-merge-write to avoid clobbering other metadata keys (e.g. catalogue_flow_label).
// The metadata column is a shared JSONB blob; only the `label` key is owned by the studio.
export async function saveLabel(
  screenshotId: string,
  label: ScreenshotLabel,
): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error: readError } = await supabase
    .from('screenshots')
    .select('metadata')
    .eq('id', screenshotId)
    .single();

  if (readError || !row) {
    console.error('[saveLabel] read failed', { screenshotId, readError });
    return { ok: false, error: readError?.message ?? 'Screenshot not found' };
  }

  const currentMetadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata = { ...currentMetadata, label };

  // .select() after update verifies the row was actually written. If RLS or
  // a missing privilege blocks the update, Supabase returns success with
  // zero rows — the .select() will return null and we surface a clear error.
  const { data: updated, error: writeError } = await supabase
    .from('screenshots')
    .update({ metadata: nextMetadata })
    .eq('id', screenshotId)
    .select('id, metadata')
    .single();

  if (writeError) {
    console.error('[saveLabel] update error', { screenshotId, writeError });
    return { ok: false, error: writeError.message };
  }

  if (!updated) {
    console.error('[saveLabel] update returned no row — likely RLS or permission block', { screenshotId });
    return {
      ok: false,
      error: 'Update did not affect any row. Likely RLS or anon-role permission is blocking writes on the screenshots table.',
    };
  }

  return { ok: true };
}
