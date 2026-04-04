import type { ScreenFamily, ScreenshotNode, WebPreset } from '../types';
export const CATALOGUE_FLOW_LABEL_KEY = 'catalogue_flow_label';
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
  project_id: string;
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
): CatalogueVariantView | null {
  if (!activeVariantKey) return getDefaultFamilyVariant(family);
  return family.variants.find((variant) => variant.key === activeVariantKey) ?? getDefaultFamilyVariant(family);
}

export function buildLegacyFamily(screenshot: ScreenshotNode): ScreenFamily {
  return {
    id: `${LEGACY_FAMILY_PREFIX}${screenshot.id}`,
    project_id: screenshot.project_id,
    name: screenshot.name,
    group: screenshot.group,
    flow_id: screenshot.flow_id,
    created_at: screenshot.created_at,
    updated_at: screenshot.created_at,
  };
}

export function getScreenshotFamilyId(screenshot: ScreenshotNode): string {
  return screenshot.screen_family_id || `${LEGACY_FAMILY_PREFIX}${screenshot.id}`;
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

export function buildCatalogueFamilies(
  screenshots: ScreenshotNode[],
  screenFamilies: ScreenFamily[],
  presetMap: Record<string, WebPreset>,
): CatalogueFamilyView[] {
  const familyMap = new Map(screenFamilies.map((family) => [family.id, family]));
  const grouped = new Map<string, CatalogueFamilyView>();

  for (const screenshot of screenshots) {
    const familyId = getScreenshotFamilyId(screenshot);
    const flowLabel = getScreenshotFlowLabel(screenshot);
    const family = familyMap.get(familyId) || buildLegacyFamily(screenshot);
    const existing = grouped.get(familyId);
    const variant: CatalogueVariantView = {
      id: screenshot.id,
      key: getVariantKey(screenshot),
      label: getVariantLabel(screenshot, presetMap),
      screenshot,
    };

    if (existing) {
      if (!existing.variants.some((item) => item.key === variant.key && item.id === variant.id)) {
        existing.variants.push(variant);
      }
      if (!existing.flow_label && flowLabel) {
        existing.flow_label = flowLabel;
      }
      continue;
    }

    grouped.set(familyId, {
      id: family.id,
      name: family.name || screenshot.name,
      group: family.group ?? screenshot.group,
      flow_id: family.flow_id ?? screenshot.flow_id,
      flow_label: flowLabel,
      project_id: family.project_id || screenshot.project_id,
      created_at: family.created_at || screenshot.created_at,
      isLegacy: family.id.startsWith(LEGACY_FAMILY_PREFIX),
      variants: [variant],
    });
  }

  return Array.from(grouped.values()).map((family) => ({
    ...family,
    variants: family.variants.sort((left, right) => left.label.localeCompare(right.label)),
  }));
}
