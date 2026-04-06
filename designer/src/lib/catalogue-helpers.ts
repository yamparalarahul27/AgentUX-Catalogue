import { parseCatalogueViewMode, DEFAULT_CATALOGUE_VIEW_MODE, type CatalogueViewMode } from './catalogue-view';

const CATALOGUE_VIEW_MODE_KEY = 'catalogue:view-mode';

export function defaultViewMode(): CatalogueViewMode {
  try {
    return parseCatalogueViewMode(window.localStorage.getItem(CATALOGUE_VIEW_MODE_KEY));
  } catch {
    return DEFAULT_CATALOGUE_VIEW_MODE;
  }
}

export function persistViewMode(viewMode: CatalogueViewMode) {
  try {
    window.localStorage.setItem(CATALOGUE_VIEW_MODE_KEY, viewMode);
  } catch {
    // ignore write errors
  }
}

export function buildPresetUsage(screenshots: { web_preset_key: string | null }[]) {
  return screenshots.reduce<Record<string, number>>((accumulator, screenshot) => {
    if (!screenshot.web_preset_key) return accumulator;
    accumulator[screenshot.web_preset_key] = (accumulator[screenshot.web_preset_key] || 0) + 1;
    return accumulator;
  }, {});
}
