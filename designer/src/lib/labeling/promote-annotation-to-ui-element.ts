import { supabase } from '../supabase';
import { createDefaultLabel } from './default-label';
import { saveLabel } from './save-label';
import type { ScreenshotLabel } from './types';
import type { ScreenshotNode } from '../../types';

// Read-merge-write the screenshot's metadata.label.screen_analysis.ui_elements
// array, adding the new UI Element name de-duped (case-insensitive). If the
// screenshot has no label yet, bootstraps one from the default scaffold so
// other studio-owned fields aren't lost.
//
// Why this exists: PR for "UI Element from annotation" gives any annotator
// a way to promote their area annotation into the UI Element taxonomy
// (previously only settable from the Labelling Studio). The annotation row
// is saved through the existing annotation API; this is the second write
// that makes the value appear in the filter sheet.
//
// Failure surface: best-effort second write. If this returns ok:false, the
// annotation row is still saved (it was written first). Caller should log
// + surface a non-blocking notice to the user.
export async function promoteAnnotationToUiElement(
  screenshot: ScreenshotNode,
  uiElementName: string,
  userEmail: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = uiElementName.trim();
  if (!normalized) return { ok: false, error: 'Empty UI Element name' };

  // Re-read metadata to avoid clobbering writes that may have happened
  // since the screenshot snapshot in the lightbox was fetched.
  const { data: row, error: readError } = await supabase
    .from('screenshots')
    .select('metadata')
    .eq('id', screenshot.id)
    .single();
  if (readError || !row) {
    return { ok: false, error: readError?.message ?? 'Screenshot not found' };
  }

  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const existingLabel = metadata.label as ScreenshotLabel | undefined;

  // Bootstrap a fresh label when none exists; otherwise clone the live one
  // and patch only the ui_elements array.
  const label: ScreenshotLabel = existingLabel?.screen_analysis
    ? existingLabel
    : createDefaultLabel({ userEmail, screenshot });

  const current = label.screen_analysis.ui_elements ?? [];
  const lower = normalized.toLowerCase();
  if (current.some((value) => value.toLowerCase() === lower)) {
    // Already present (possibly with different casing). No-op success.
    return { ok: true };
  }

  const next: ScreenshotLabel = {
    ...label,
    screen_analysis: {
      ...label.screen_analysis,
      ui_elements: [...current, normalized],
    },
  };

  return saveLabel(screenshot.id, next);
}

// Normalize a user-typed UI Element name into the canonical form stored in
// the taxonomy. Rules: trim, collapse internal whitespace, Title Case each
// word. Empty input returns empty (caller should guard).
export function normalizeUiElementName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}
