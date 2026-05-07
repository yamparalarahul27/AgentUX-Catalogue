import type { ScreenshotNode } from '../../types';
import type { ScreenshotLabel } from './types';

interface DerivedFilterValues {
  pageTypes: string[];
  uiElements: string[];
  uxPatterns: string[];
  screenStates: string[];
}

function readLabel(metadata: Record<string, unknown> | undefined): ScreenshotLabel | null {
  if (!metadata) return null;
  const candidate = (metadata as Record<string, unknown>).label;
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate as ScreenshotLabel;
}

function addStrings(target: Set<string>, values: unknown): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) target.add(trimmed);
    }
  }
}

// Walk loaded screenshots and collect the distinct label values actually in use.
// The filter sheet renders chips only for values that appear on at least one
// screenshot, so unfilled vocab doesn't clutter the public catalogue UI.
export function deriveLabelFilterValues(screenshots: ScreenshotNode[]): DerivedFilterValues {
  const pageTypes = new Set<string>();
  const uiElements = new Set<string>();
  const uxPatterns = new Set<string>();
  const screenStates = new Set<string>();

  for (const screenshot of screenshots) {
    const label = readLabel(screenshot.metadata);
    if (!label) continue;
    addStrings(pageTypes, label.identity?.page_types);
    addStrings(uiElements, label.screen_analysis?.ui_elements);
    addStrings(uxPatterns, label.screen_analysis?.ux_patterns);
    const state = label.identity?.screen_state;
    if (typeof state === 'string' && state.trim()) screenStates.add(state.trim());
  }

  const sorted = (set: Set<string>) =>
    [...set].sort((left, right) => left.localeCompare(right));

  return {
    pageTypes: sorted(pageTypes),
    uiElements: sorted(uiElements),
    uxPatterns: sorted(uxPatterns),
    screenStates: sorted(screenStates),
  };
}
