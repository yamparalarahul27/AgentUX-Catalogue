// Lenient parser + diff + merge for the Paste-JSON modal.
// - Unknown top-level keys: surfaced and ignored.
// - Unknown sub-keys inside known sections: silently ignored.
// - Type-mismatched values: skipped, counted.
// - review.label_status === 'verified' is silently downgraded to 'draft'
//   so a paste cannot bypass the human verification step.

import type { LabelStatus, LabelSource, ScreenshotLabel } from './types';

const SECTION_KEYS = [
  'identity',
  'journey',
  'screen_analysis',
  'visual_design',
  'design_reference',
  'review',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

export interface FieldChange {
  section: SectionKey;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffResult {
  changes: FieldChange[];
  changesBySection: Record<SectionKey, number>;
  unknownTopLevelKeys: string[];
  typeMismatchCount: number;
  statusDowngrade: boolean;
  merged: ScreenshotLabel;
}

export type ParseAndDiffResult =
  | { ok: false; error: string }
  | { ok: true; result: DiffResult };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLabelStatus(value: unknown): value is LabelStatus {
  return value === 'unlabeled' || value === 'draft' || value === 'needs_review' || value === 'verified';
}

function isLabelSource(value: unknown): value is LabelSource {
  return value === 'user' || value === 'ai' || value === 'import' || value === 'script';
}

interface MergeContext {
  changes: FieldChange[];
  typeMismatchCount: number;
  statusDowngrade: boolean;
}

function takeString(
  ctx: MergeContext,
  section: SectionKey,
  field: string,
  raw: Record<string, unknown>,
  current: string,
): string {
  if (!(field in raw)) return current;
  const value = raw[field];
  if (typeof value !== 'string') {
    ctx.typeMismatchCount += 1;
    return current;
  }
  if (value === current) return current;
  ctx.changes.push({ section, field, oldValue: current, newValue: value });
  return value;
}

function takeStringOrNull(
  ctx: MergeContext,
  section: SectionKey,
  field: string,
  raw: Record<string, unknown>,
  current: string | null,
): string | null {
  if (!(field in raw)) return current;
  const value = raw[field];
  if (value !== null && typeof value !== 'string') {
    ctx.typeMismatchCount += 1;
    return current;
  }
  if (value === current) return current;
  ctx.changes.push({ section, field, oldValue: current, newValue: value });
  return value as string | null;
}

function takeNumberOrNull(
  ctx: MergeContext,
  section: SectionKey,
  field: string,
  raw: Record<string, unknown>,
  current: number | null,
): number | null {
  if (!(field in raw)) return current;
  const value = raw[field];
  if (value !== null && typeof value !== 'number') {
    ctx.typeMismatchCount += 1;
    return current;
  }
  if (value === current) return current;
  ctx.changes.push({ section, field, oldValue: current, newValue: value });
  return value as number | null;
}

function takeStringArray(
  ctx: MergeContext,
  section: SectionKey,
  field: string,
  raw: Record<string, unknown>,
  current: string[],
): string[] {
  if (!(field in raw)) return current;
  const value = raw[field];
  if (!isStringArray(value)) {
    ctx.typeMismatchCount += 1;
    return current;
  }
  // Compare by JSON to detect actual change; arrays are reference-different.
  if (JSON.stringify(value) === JSON.stringify(current)) return current;
  ctx.changes.push({ section, field, oldValue: current, newValue: value });
  return value;
}

function mergeIdentity(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['identity'],
): ScreenshotLabel['identity'] {
  return {
    title: takeString(ctx, 'identity', 'title', raw, current.title),
    one_line_summary: takeString(ctx, 'identity', 'one_line_summary', raw, current.one_line_summary),
    source_app: takeStringOrNull(ctx, 'identity', 'source_app', raw, current.source_app),
    product_category: takeStringOrNull(ctx, 'identity', 'product_category', raw, current.product_category),
    platform: takeStringOrNull(ctx, 'identity', 'platform', raw, current.platform),
    device_type: takeStringOrNull(ctx, 'identity', 'device_type', raw, current.device_type),
    page_types: takeStringArray(ctx, 'identity', 'page_types', raw, current.page_types),
    screen_state: takeStringOrNull(ctx, 'identity', 'screen_state', raw, current.screen_state),
  };
}

function mergeJourney(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['journey'],
): ScreenshotLabel['journey'] {
  return {
    flow_name: takeStringOrNull(ctx, 'journey', 'flow_name', raw, current.flow_name),
    step_name: takeStringOrNull(ctx, 'journey', 'step_name', raw, current.step_name),
    step_index: takeNumberOrNull(ctx, 'journey', 'step_index', raw, current.step_index),
    screens_count: takeNumberOrNull(ctx, 'journey', 'screens_count', raw, current.screens_count),
    user_problem: takeString(ctx, 'journey', 'user_problem', raw, current.user_problem),
    step_goal: takeString(ctx, 'journey', 'step_goal', raw, current.step_goal),
    user_action: takeString(ctx, 'journey', 'user_action', raw, current.user_action),
    system_response: takeString(ctx, 'journey', 'system_response', raw, current.system_response),
    previous_step: takeStringOrNull(ctx, 'journey', 'previous_step', raw, current.previous_step),
    next_step: takeStringOrNull(ctx, 'journey', 'next_step', raw, current.next_step),
    inference_notes: takeString(ctx, 'journey', 'inference_notes', raw, current.inference_notes),
  };
}

function mergeScreenAnalysis(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['screen_analysis'],
): ScreenshotLabel['screen_analysis'] {
  return {
    description: takeString(ctx, 'screen_analysis', 'description', raw, current.description),
    layout: takeString(ctx, 'screen_analysis', 'layout', raw, current.layout),
    functions: takeString(ctx, 'screen_analysis', 'functions', raw, current.functions),
    ui_elements: takeStringArray(ctx, 'screen_analysis', 'ui_elements', raw, current.ui_elements),
    ux_patterns: takeStringArray(ctx, 'screen_analysis', 'ux_patterns', raw, current.ux_patterns),
    colors: takeStringArray(ctx, 'screen_analysis', 'colors', raw, current.colors),
    visible_text: takeStringArray(ctx, 'screen_analysis', 'visible_text', raw, current.visible_text),
  };
}

function mergeVisualDesign(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['visual_design'],
): ScreenshotLabel['visual_design'] {
  return {
    theme: takeStringOrNull(ctx, 'visual_design', 'theme', raw, current.theme),
    density: takeStringOrNull(ctx, 'visual_design', 'density', raw, current.density),
    hierarchy: takeString(ctx, 'visual_design', 'hierarchy', raw, current.hierarchy),
    typography_notes: takeString(ctx, 'visual_design', 'typography_notes', raw, current.typography_notes),
    color_notes: takeString(ctx, 'visual_design', 'color_notes', raw, current.color_notes),
    spacing_notes: takeString(ctx, 'visual_design', 'spacing_notes', raw, current.spacing_notes),
    style_keywords: takeStringArray(ctx, 'visual_design', 'style_keywords', raw, current.style_keywords),
  };
}

function mergeDesignReference(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['design_reference'],
): ScreenshotLabel['design_reference'] {
  return {
    good_for: takeStringArray(ctx, 'design_reference', 'good_for', raw, current.good_for),
    use_when_designing: takeStringArray(ctx, 'design_reference', 'use_when_designing', raw, current.use_when_designing),
    patterns_to_steal: takeStringArray(ctx, 'design_reference', 'patterns_to_steal', raw, current.patterns_to_steal),
    risks_or_anti_patterns: takeStringArray(ctx, 'design_reference', 'risks_or_anti_patterns', raw, current.risks_or_anti_patterns),
    avoid_using_when: takeStringArray(ctx, 'design_reference', 'avoid_using_when', raw, current.avoid_using_when),
    similar_reference_queries: takeStringArray(ctx, 'design_reference', 'similar_reference_queries', raw, current.similar_reference_queries),
  };
}

function mergeReview(
  ctx: MergeContext,
  raw: Record<string, unknown>,
  current: ScreenshotLabel['review'],
): ScreenshotLabel['review'] {
  let nextStatus: LabelStatus = current.label_status;
  if ('label_status' in raw) {
    const value = raw.label_status;
    if (isLabelStatus(value)) {
      const downgraded: LabelStatus = value === 'verified' ? 'draft' : value;
      if (value === 'verified' && current.label_status !== 'verified') {
        ctx.statusDowngrade = true;
      }
      if (downgraded !== current.label_status) {
        ctx.changes.push({
          section: 'review',
          field: 'label_status',
          oldValue: current.label_status,
          newValue: downgraded,
        });
        nextStatus = downgraded;
      }
    } else {
      ctx.typeMismatchCount += 1;
    }
  }

  let nextSource: LabelSource = current.source;
  if ('source' in raw) {
    const value = raw.source;
    if (isLabelSource(value)) {
      if (value !== current.source) {
        ctx.changes.push({ section: 'review', field: 'source', oldValue: current.source, newValue: value });
        nextSource = value;
      }
    } else {
      ctx.typeMismatchCount += 1;
    }
  }

  return {
    label_status: nextStatus,
    confidence: takeNumberOrNull(ctx, 'review', 'confidence', raw, current.confidence),
    missing_fields: takeStringArray(ctx, 'review', 'missing_fields', raw, current.missing_fields),
    admin_notes: takeString(ctx, 'review', 'admin_notes', raw, current.admin_notes),
    source: nextSource,
    source_email: takeStringOrNull(ctx, 'review', 'source_email', raw, current.source_email),
    model: takeStringOrNull(ctx, 'review', 'model', raw, current.model),
    prompt_version: takeStringOrNull(ctx, 'review', 'prompt_version', raw, current.prompt_version),
    vocab_version: takeString(ctx, 'review', 'vocab_version', raw, current.vocab_version),
  };
}

export function parseAndDiff(text: string, current: ScreenshotLabel): ParseAndDiffResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste JSON to preview.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Top-level value must be a JSON object.' };
  }

  const ctx: MergeContext = { changes: [], typeMismatchCount: 0, statusDowngrade: false };

  const identity = isPlainObject(parsed.identity)
    ? mergeIdentity(ctx, parsed.identity, current.identity)
    : current.identity;
  const journey = isPlainObject(parsed.journey)
    ? mergeJourney(ctx, parsed.journey, current.journey)
    : current.journey;
  const screen_analysis = isPlainObject(parsed.screen_analysis)
    ? mergeScreenAnalysis(ctx, parsed.screen_analysis, current.screen_analysis)
    : current.screen_analysis;
  const visual_design = isPlainObject(parsed.visual_design)
    ? mergeVisualDesign(ctx, parsed.visual_design, current.visual_design)
    : current.visual_design;
  const design_reference = isPlainObject(parsed.design_reference)
    ? mergeDesignReference(ctx, parsed.design_reference, current.design_reference)
    : current.design_reference;
  const review = isPlainObject(parsed.review)
    ? mergeReview(ctx, parsed.review, current.review)
    : current.review;

  const knownKeys = new Set<string>(SECTION_KEYS);
  const unknownTopLevelKeys = Object.keys(parsed).filter((key) => !knownKeys.has(key as SectionKey));

  const changesBySection: Record<SectionKey, number> = {
    identity: 0,
    journey: 0,
    screen_analysis: 0,
    visual_design: 0,
    design_reference: 0,
    review: 0,
  };
  for (const change of ctx.changes) {
    changesBySection[change.section] += 1;
  }

  const merged: ScreenshotLabel = {
    identity,
    journey,
    screen_analysis,
    visual_design,
    design_reference,
    review,
  };

  return {
    ok: true,
    result: {
      changes: ctx.changes,
      changesBySection,
      unknownTopLevelKeys,
      typeMismatchCount: ctx.typeMismatchCount,
      statusDowngrade: ctx.statusDowngrade,
      merged,
    },
  };
}
