import type { ScreenshotLabel } from './types';

export interface RequiredFieldRule {
  key: string;
  label: string;
  test: (label: ScreenshotLabel) => boolean;
}

// The 10-rule strict required set agreed in §18.4. Order matches the
// editor's section flow so the missing-fields list reads top-down.
export const REQUIRED_FIELDS: ReadonlyArray<RequiredFieldRule> = [
  { key: 'identity.title',
    label: 'Title',
    test: (l) => l.identity.title.trim().length > 0 },
  { key: 'identity.one_line_summary',
    label: 'One-line summary',
    test: (l) => l.identity.one_line_summary.trim().length > 0 },
  { key: 'identity.platform',
    label: 'Platform',
    test: (l) => l.identity.platform !== null && l.identity.platform.length > 0 },
  { key: 'identity.device_type',
    label: 'Device type',
    test: (l) => l.identity.device_type !== null && l.identity.device_type.length > 0 },
  { key: 'identity.page_types',
    label: 'Page types (≥1)',
    test: (l) => l.identity.page_types.length >= 1 },
  { key: 'identity.screen_state',
    label: 'Screen state',
    test: (l) => l.identity.screen_state !== null && l.identity.screen_state.length > 0 },
  { key: 'screen_analysis.ui_elements',
    label: 'UI elements (≥1)',
    test: (l) => l.screen_analysis.ui_elements.length >= 1 },
  { key: 'screen_analysis.ux_patterns',
    label: 'UX patterns (≥1)',
    test: (l) => l.screen_analysis.ux_patterns.length >= 1 },
  { key: 'design_reference.good_for',
    label: 'Good for (≥1)',
    test: (l) => l.design_reference.good_for.length >= 1 },
  { key: 'design_reference.similar_reference_queries',
    label: 'Similar reference queries (≥3)',
    test: (l) => l.design_reference.similar_reference_queries.length >= 3 },
];

export interface ValidateResult {
  ok: boolean;
  missing: string[];
  doneCount: number;
  totalCount: number;
}

export function validateForVerify(label: ScreenshotLabel): ValidateResult {
  const missing: string[] = [];
  let doneCount = 0;
  for (const rule of REQUIRED_FIELDS) {
    if (rule.test(label)) doneCount += 1;
    else missing.push(rule.label);
  }
  return {
    ok: missing.length === 0,
    missing,
    doneCount,
    totalCount: REQUIRED_FIELDS.length,
  };
}
