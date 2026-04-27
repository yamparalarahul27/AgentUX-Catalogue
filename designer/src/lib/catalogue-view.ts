export type CatalogueViewMode = 'grid' | 'stack' | 'gallery';

export const DEFAULT_CATALOGUE_VIEW_MODE: CatalogueViewMode = 'grid';

/**
 * Parse a persisted view mode value.
 * Legacy 'list' value is migrated to 'stack' (Stack view replaces List view).
 * Unknown values fall back to the default.
 */
export function parseCatalogueViewMode(value: string | null | undefined): CatalogueViewMode {
  if (value === 'list') return 'stack';
  if (value === 'stack' || value === 'gallery' || value === 'grid') {
    return value;
  }
  return DEFAULT_CATALOGUE_VIEW_MODE;
}
