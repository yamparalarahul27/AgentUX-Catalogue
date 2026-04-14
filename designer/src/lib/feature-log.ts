import type { FeatureLogStatus, FeatureLogSummary } from '../types';

export const FEATURE_LOG_STATUS_ORDER: FeatureLogStatus[] = ['shipped', 'designed', 'planned'];
export const FEATURE_LOG_PAGE_SIZE = 40;

export function normalizeFeatureLogStatus(value: unknown): FeatureLogStatus {
  if (value === 'planned' || value === 'designed' || value === 'shipped') {
    return value;
  }
  return 'planned';
}

export function featureLogStatusRank(status: FeatureLogStatus): number {
  const index = FEATURE_LOG_STATUS_ORDER.indexOf(status);
  return index === -1 ? FEATURE_LOG_STATUS_ORDER.length : index;
}

function parseCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return 0;
}

export function toFeatureLogSummary(row: Record<string, unknown>): FeatureLogSummary {
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    status: normalizeFeatureLogStatus(row.status),
    created_at: String(row.created_at || new Date(0).toISOString()),
    updated_at: String(row.updated_at || new Date(0).toISOString()),
    design_count: parseCount(row.design_count),
    shipped_count: parseCount(row.shipped_count),
    total_count: parseCount(row.total_count),
  };
}

export function groupFeatureLogsByStatus(features: FeatureLogSummary[]) {
  const grouped: Record<FeatureLogStatus, FeatureLogSummary[]> = {
    shipped: [],
    designed: [],
    planned: [],
  };

  for (const feature of features) {
    grouped[feature.status].push(feature);
  }

  return grouped;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortFeatureLogSummaries(features: FeatureLogSummary[]): FeatureLogSummary[] {
  return [...features].sort((left, right) => {
    const statusDiff = featureLogStatusRank(left.status) - featureLogStatusRank(right.status);
    if (statusDiff !== 0) return statusDiff;

    const updatedAtDiff = parseTimestamp(right.updated_at) - parseTimestamp(left.updated_at);
    if (updatedAtDiff !== 0) return updatedAtDiff;

    return left.id.localeCompare(right.id);
  });
}
