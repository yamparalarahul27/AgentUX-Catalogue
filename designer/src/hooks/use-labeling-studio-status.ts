import { useMemo, useState } from 'react';

import type { ScreenshotNode } from '../types';
import { readLabelStatus } from '../lib/labeling/label-status';
import type { LabelStatus } from '../lib/labeling/types';

export type StudioStatusFilter = 'all' | LabelStatus;

export interface StudioStatusBucket {
  key: StudioStatusFilter;
  label: string;
  count: number;
}

const BUCKET_ORDER: ReadonlyArray<StudioStatusFilter> = [
  'all',
  'unlabeled',
  'draft',
  'needs_review',
  'verified',
];

const BUCKET_LABEL: Record<StudioStatusFilter, string> = {
  all: 'All',
  unlabeled: 'Unlabelled',
  draft: 'Draft',
  needs_review: 'Needs review',
  verified: 'Verified',
};

export function useLabelingStudioStatus(screenshots: ScreenshotNode[]) {
  const [filter, setFilter] = useState<StudioStatusFilter>('all');

  const statusByScreenshotId = useMemo(() => {
    const map = new Map<string, LabelStatus>();
    for (const screenshot of screenshots) {
      map.set(screenshot.id, readLabelStatus(screenshot));
    }
    return map;
  }, [screenshots]);

  const counts = useMemo(() => {
    const next: Record<StudioStatusFilter, number> = {
      all: screenshots.length,
      unlabeled: 0,
      draft: 0,
      needs_review: 0,
      verified: 0,
    };
    for (const status of statusByScreenshotId.values()) next[status] += 1;
    return next;
  }, [screenshots.length, statusByScreenshotId]);

  const buckets: StudioStatusBucket[] = useMemo(
    () => BUCKET_ORDER.map((key) => ({ key, label: BUCKET_LABEL[key], count: counts[key] })),
    [counts],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return screenshots;
    return screenshots.filter((screenshot) => statusByScreenshotId.get(screenshot.id) === filter);
  }, [filter, screenshots, statusByScreenshotId]);

  return { filter, setFilter, buckets, filtered, statusByScreenshotId };
}
