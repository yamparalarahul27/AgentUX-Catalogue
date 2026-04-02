import type { ScreenshotNode } from '../types';

export type CatalogueViewBy = 'all' | 'comments-added' | 'annotations-added';

export const DEFAULT_CATALOGUE_VIEW_BY: CatalogueViewBy = 'all';
export const ANNOTATION_METADATA_KEY = 'lightbox_annotations';

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function compareByName(left: ScreenshotNode, right: ScreenshotNode): number {
  const nameCompare = normalizeName(left.name).localeCompare(normalizeName(right.name));
  if (nameCompare !== 0) return nameCompare;
  return left.id.localeCompare(right.id);
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseAnnotationPayload(raw: unknown): Record<string, unknown>[] {
  let payload = raw;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

export function getLightboxAnnotationEntries(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  return parseAnnotationPayload(metadata?.[ANNOTATION_METADATA_KEY]);
}

export function getAnnotationActivity(
  metadata: Record<string, unknown> | null | undefined,
): { count: number; lastAddedAt: string | null } {
  const entries = getLightboxAnnotationEntries(metadata);
  let latestTs: number | null = null;
  let latestValue: string | null = null;

  for (const entry of entries) {
    const createdAt = typeof entry.created_at === 'string'
      ? entry.created_at
      : (typeof entry.createdAt === 'string' ? entry.createdAt : null);
    const ts = parseTimestamp(createdAt);
    if (ts === null) continue;
    if (latestTs === null || ts > latestTs) {
      latestTs = ts;
      latestValue = createdAt;
    }
  }

  return {
    count: entries.length,
    lastAddedAt: latestValue,
  };
}

export function parseCatalogueViewBy(value: string | null | undefined): CatalogueViewBy {
  if (value === 'comments-added' || value === 'annotations-added' || value === 'all') {
    return value;
  }

  return DEFAULT_CATALOGUE_VIEW_BY;
}

function compareByCreatedAtDesc(left: ScreenshotNode, right: ScreenshotNode): number {
  const leftTs = parseTimestamp(left.created_at);
  const rightTs = parseTimestamp(right.created_at);

  if (leftTs !== null && rightTs !== null && leftTs !== rightTs) return rightTs - leftTs;
  if (leftTs !== null && rightTs === null) return -1;
  if (leftTs === null && rightTs !== null) return 1;

  return compareByName(left, right);
}

export function sortByCommentActivity(screenshots: ScreenshotNode[]): ScreenshotNode[] {
  const sorted = [...screenshots];

  sorted.sort((left, right) => {
    const leftTs = parseTimestamp(left.comment_last_added_at);
    const rightTs = parseTimestamp(right.comment_last_added_at);

    if (leftTs !== null && rightTs !== null && leftTs !== rightTs) return rightTs - leftTs;
    if (leftTs !== null && rightTs === null) return -1;
    if (leftTs === null && rightTs !== null) return 1;

    const leftCount = left.comment_count ?? 0;
    const rightCount = right.comment_count ?? 0;
    if (leftCount !== rightCount) return rightCount - leftCount;

    return compareByCreatedAtDesc(left, right);
  });

  return sorted;
}

export function sortByAnnotationActivity(screenshots: ScreenshotNode[]): ScreenshotNode[] {
  const sorted = [...screenshots];

  sorted.sort((left, right) => {
    const leftTs = parseTimestamp(left.annotation_last_added_at);
    const rightTs = parseTimestamp(right.annotation_last_added_at);

    if (leftTs !== null && rightTs !== null && leftTs !== rightTs) return rightTs - leftTs;
    if (leftTs !== null && rightTs === null) return -1;
    if (leftTs === null && rightTs !== null) return 1;

    const leftCount = left.annotation_count ?? 0;
    const rightCount = right.annotation_count ?? 0;
    if (leftCount !== rightCount) return rightCount - leftCount;

    return compareByCreatedAtDesc(left, right);
  });

  return sorted;
}
