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
    return { ok: false, error: readError?.message ?? 'Screenshot not found' };
  }

  const currentMetadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata = { ...currentMetadata, label };

  const { error: writeError } = await supabase
    .from('screenshots')
    .update({ metadata: nextMetadata })
    .eq('id', screenshotId);

  if (writeError) return { ok: false, error: writeError.message };
  return { ok: true };
}
