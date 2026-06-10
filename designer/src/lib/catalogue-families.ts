import type { ScreenshotNode, WebPreset } from '../types';
export const CATALOGUE_FLOW_LABEL_KEY = 'catalogue_flow_label';
// All family ids carry this prefix post-Phase 5 (every screenshot is
// its own synthetic family — see docs/screen-families-audit.md).
// Kept as a constant since the mutation queue and a couple of legacy
// checks still match on the prefix string.
const LEGACY_FAMILY_PREFIX = 'legacy-family-';

export interface CatalogueVariantView {
  id: string;
  key: string;
  label: string;
  screenshot: ScreenshotNode;
}

export interface CatalogueFamilyView {
  id: string;
  name: string;
  group: string | null;
  flow_id: string | null;
  flow_label: string | null;
  created_at?: string;
  isLegacy: boolean;
  variants: CatalogueVariantView[];
}

function normalizeFlowLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function getScreenshotFlowLabel(screenshot: ScreenshotNode): string | null {
  return normalizeFlowLabel(screenshot.metadata?.[CATALOGUE_FLOW_LABEL_KEY]);
}

export function getDefaultFamilyVariant(
  family: CatalogueFamilyView,
): CatalogueVariantView | null {
  return family.variants[0] ?? null;
}

export function getActiveFamilyVariant(
  family: CatalogueFamilyView,
  activeVariantKey: string | null | undefined,
  // Optional screenshot-ID tie-breaker. Variant keys are
  // `theme:platform:preset` shaped, so when a family contains multiple
  // screenshots that share the same key (common for multiple iterations
  // of the same view), `find()` would otherwise always return the first
  // one — not necessarily the one the user just selected (e.g., from
  // search). When `preferredScreenshotId` is given, prefer the variant
  // matching BOTH key + id; fall back to key-only if no exact match.
  preferredScreenshotId?: string | null,
): CatalogueVariantView | null {
  if (!activeVariantKey) {
    if (preferredScreenshotId) {
      const byId = family.variants.find((variant) => variant.id === preferredScreenshotId);
      if (byId) return byId;
    }
    return getDefaultFamilyVariant(family);
  }
  if (preferredScreenshotId) {
    const exact = family.variants.find(
      (variant) => variant.key === activeVariantKey && variant.id === preferredScreenshotId,
    );
    if (exact) return exact;
  }
  return family.variants.find((variant) => variant.key === activeVariantKey) ?? getDefaultFamilyVariant(family);
}

export function getScreenshotFamilyId(screenshot: ScreenshotNode): string {
  return `${LEGACY_FAMILY_PREFIX}${screenshot.id}`;
}

export function getVariantKey(screenshot: ScreenshotNode): string {
  if (screenshot.platform === 'web') {
    return `${screenshot.theme || 'unthemed'}:web:${screenshot.web_preset_key || 'unclassified'}`;
  }

  if (screenshot.platform === 'mobile') {
    return `${screenshot.theme || 'unthemed'}:mobile:${screenshot.mobile_os || 'unclassified'}`;
  }

  return `${screenshot.theme || 'unthemed'}:unknown:${screenshot.id}`;
}

export function getVariantLabel(
  screenshot: ScreenshotNode,
  presetMap: Record<string, WebPreset>,
): string {
  const themeLabel = screenshot.theme === 'dark'
    ? 'Dark'
    : screenshot.theme === 'light'
      ? 'Light'
      : 'Unthemed';

  if (screenshot.platform === 'web') {
    const preset = screenshot.web_preset_key ? presetMap[screenshot.web_preset_key] : null;
    return `${themeLabel} / Web / ${preset?.label || 'Unclassified'}`;
  }

  if (screenshot.platform === 'mobile') {
    const os = screenshot.mobile_os === 'ios'
      ? 'iOS'
      : screenshot.mobile_os === 'android'
        ? 'Android'
        : 'Unclassified';
    return `${themeLabel} / Mobile / ${os}`;
  }

  return `${themeLabel} / Unclassified`;
}

// Build a one-variant family view directly from a screenshot record.
// Used by the search modal: when the user clicks a screenshot result,
// we already have the full ScreenshotNode in hand from the search
// matcher, so we don't need to resolve through fullScopeFamilyById
// (which can lag full-scope hydration and silently fall back to the
// wrong variant). The lightbox renders this synthetic family as a
// single-variant view — sibling variants aren't shown, which matches
// the user's intent (they clicked THIS exact screenshot in search,
// not its family).
export function buildSyntheticFamilyFromScreenshot(
  screenshot: ScreenshotNode,
  presetMap: Record<string, WebPreset>,
): CatalogueFamilyView {
  const flowLabel = getScreenshotFlowLabel(screenshot);
  const familyId = getScreenshotFamilyId(screenshot);
  return {
    id: familyId,
    name: screenshot.name,
    group: screenshot.group,
    flow_id: screenshot.flow_id,
    flow_label: flowLabel,
    created_at: screenshot.created_at,
    isLegacy: familyId.startsWith(LEGACY_FAMILY_PREFIX),
    variants: [{
      id: screenshot.id,
      key: getVariantKey(screenshot),
      label: getVariantLabel(screenshot, presetMap),
      screenshot,
    }],
  };
}

// Group screenshots into families. Post-Phase 4 of the screen_families
// removal, every screenshot is its own family — the FK column is
// gone and there's no shared key to merge variants on.
export function buildCatalogueFamilies(
  screenshots: ScreenshotNode[],
  presetMap: Record<string, WebPreset>,
): CatalogueFamilyView[] {
  const grouped = new Map<string, CatalogueFamilyView>();

  for (const screenshot of screenshots) {
    const familyId = getScreenshotFamilyId(screenshot);
    const flowLabel = getScreenshotFlowLabel(screenshot);
    const variant: CatalogueVariantView = {
      id: screenshot.id,
      key: getVariantKey(screenshot),
      label: getVariantLabel(screenshot, presetMap),
      screenshot,
    };

    const existing = grouped.get(familyId);
    if (existing) {
      if (!existing.variants.some((item) => item.key === variant.key && item.id === variant.id)) {
        existing.variants.push(variant);
      }
      if (!existing.flow_label && flowLabel) {
        existing.flow_label = flowLabel;
      }
      continue;
    }

    // Every family is now synthesised directly from the screenshot —
    // post-Phase 5 there's no shared family row to merge against.
    grouped.set(familyId, {
      id: familyId,
      name: screenshot.name,
      group: screenshot.group,
      flow_id: screenshot.flow_id,
      flow_label: flowLabel,
      created_at: screenshot.created_at,
      isLegacy: true,
      variants: [variant],
    });
  }

  return Array.from(grouped.values()).map((family) => ({
    ...family,
    variants: family.variants.sort((left, right) => left.label.localeCompare(right.label)),
  }));
}
