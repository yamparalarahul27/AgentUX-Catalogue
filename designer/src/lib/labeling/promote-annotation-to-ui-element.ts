import { supabase } from '../supabase';
import { createDefaultLabel } from './default-label';
import { saveLabel } from './save-label';
import type { ScreenshotLabel, UiElementAnchor, UiElementBbox } from './types';
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
// Optional bbox carried in from the annotation row. When the user draws
// an area annotation in the lightbox, we get the coordinates and pass
// them here so the label's ui_element_anchors stays in sync with the
// annotations table — that's what the Elements browse view's "cropped"
// mode will read from. Old call-sites that pre-date bboxes can omit;
// the function still works for them, just without a bbox.
export interface PromoteOptions {
  bbox?: UiElementBbox | null;
}

export async function promoteAnnotationToUiElement(
  screenshot: ScreenshotNode,
  uiElementName: string,
  userEmail: string | null,
  options: PromoteOptions = {},
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
  // and patch the ui_elements + ui_element_anchors arrays.
  const label: ScreenshotLabel = existingLabel?.screen_analysis
    ? existingLabel
    : createDefaultLabel({ userEmail, screenshot });

  const currentNames = label.screen_analysis.ui_elements ?? [];
  const currentAnchors = label.screen_analysis.ui_element_anchors ?? [];
  const lower = normalized.toLowerCase();
  const nameAlreadyPresent = currentNames.some((value) => value.toLowerCase() === lower);
  const anchorIndex = currentAnchors.findIndex((anchor) => anchor.name.toLowerCase() === lower);
  const bbox: UiElementBbox | null = options.bbox ?? null;

  // No-op when nothing would change: name already in taxonomy AND
  // (no bbox to add OR an anchor with this name already exists).
  if (nameAlreadyPresent && (bbox === null || anchorIndex >= 0)) {
    return { ok: true };
  }

  const nextNames = nameAlreadyPresent ? currentNames : [...currentNames, normalized];

  let nextAnchors: UiElementAnchor[];
  if (bbox === null) {
    // Drawing without a bbox shouldn't add an anchor — only the
    // taxonomy entry. The anchors array stays untouched.
    nextAnchors = currentAnchors;
  } else if (anchorIndex >= 0) {
    // Replace the existing anchor's bbox with the new one. Manual
    // re-promotion is treated as the latest source of truth.
    nextAnchors = currentAnchors.map((anchor, i) =>
      i === anchorIndex ? { ...anchor, bbox, confidence: 1 } : anchor,
    );
  } else {
    // First anchor for this element. Manual draws are full confidence.
    nextAnchors = [...currentAnchors, { name: normalized, bbox, confidence: 1 }];
  }

  const next: ScreenshotLabel = {
    ...label,
    screen_analysis: {
      ...label.screen_analysis,
      ui_elements: nextNames,
      ui_element_anchors: nextAnchors,
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
