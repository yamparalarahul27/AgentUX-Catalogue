export type CatalogueViewMode = 'grid' | 'list' | 'gallery';

export const DEFAULT_CATALOGUE_VIEW_MODE: CatalogueViewMode = 'grid';

export function parseCatalogueViewMode(value: string | null | undefined): CatalogueViewMode {
  if (value === 'list' || value === 'gallery' || value === 'grid') {
    return value;
  }
  return DEFAULT_CATALOGUE_VIEW_MODE;
}
