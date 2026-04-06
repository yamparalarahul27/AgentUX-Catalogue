import type { ScreenshotNode } from '../types';

export type CatalogueSortOption = 'date-desc' | 'date-desc-global' | 'date-asc' | 'name-asc';

export const DEFAULT_CATALOGUE_SORT: CatalogueSortOption = 'date-desc';

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function compareByName(left: ScreenshotNode, right: ScreenshotNode): number {
  const nameCompare = normalizeName(left.name).localeCompare(normalizeName(right.name));
  if (nameCompare !== 0) return nameCompare;
  return left.id.localeCompare(right.id);
}

function parseTimestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function compareByDate(
  left: ScreenshotNode,
  right: ScreenshotNode,
  direction: 'asc' | 'desc',
): number {
  const leftTs = parseTimestamp(left.created_at);
  const rightTs = parseTimestamp(right.created_at);

  if (leftTs !== null && rightTs !== null && leftTs !== rightTs) {
    return direction === 'desc' ? rightTs - leftTs : leftTs - rightTs;
  }

  if (leftTs !== null && rightTs === null) return -1;
  if (leftTs === null && rightTs !== null) return 1;

  return compareByName(left, right);
}

export function sortCatalogueScreenshots(
  screenshots: ScreenshotNode[],
  sortBy: CatalogueSortOption,
): ScreenshotNode[] {
  const sorted = [...screenshots];

  switch (sortBy) {
    case 'name-asc':
      sorted.sort(compareByName);
      return sorted;
    case 'date-asc':
      sorted.sort((left, right) => compareByDate(left, right, 'asc'));
      return sorted;
    case 'date-desc-global':
      sorted.sort((left, right) => compareByDate(left, right, 'desc'));
      return sorted;
    case 'date-desc':
    default:
      sorted.sort((left, right) => compareByDate(left, right, 'desc'));
      return sorted;
  }
}
