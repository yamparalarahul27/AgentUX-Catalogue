import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { LabelStatus } from '../lib/labeling/types';

export type StudioTotalsKey = 'all' | LabelStatus;

export type StudioTotals = Record<StudioTotalsKey, number>;

const ZERO_TOTALS: StudioTotals = {
  all: 0,
  unlabeled: 0,
  draft: 0,
  needs_review: 0,
  verified: 0,
};

// Aggregates label-status counts across ALL screenshots in scope (not just the
// loaded paginated grid). Four parallel HEAD count queries — cheap and accurate.
// Unlabelled is derived: total − (draft + needs_review + verified). This catches
// both screenshots with an explicit 'unlabeled' status and those with no
// metadata.label at all.
export function useLabelingStudioTotals(projectIds: string[]) {
  const projectIdsKey = useMemo(() => [...projectIds].sort().join(','), [projectIds]);
  const [totals, setTotals] = useState<StudioTotals>(ZERO_TOTALS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  const refetch = useCallback(() => {
    setRefetchTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const ids = projectIdsKey ? projectIdsKey.split(',') : [];
    if (ids.length === 0) {
      setTotals(ZERO_TOTALS);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const path = 'metadata->label->review->>label_status';
      const [totalRes, draftRes, needsRes, verifiedRes] = await Promise.all([
        supabase.from('screenshots').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('project_id', ids),
        supabase.from('screenshots').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('project_id', ids).eq(path, 'draft'),
        supabase.from('screenshots').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('project_id', ids).eq(path, 'needs_review'),
        supabase.from('screenshots').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('project_id', ids).eq(path, 'verified'),
      ]);
      if (cancelled) return;
      const firstError = totalRes.error || draftRes.error || needsRes.error || verifiedRes.error;
      if (firstError) {
        console.error('[useLabelingStudioTotals] aggregation failed', firstError);
        setError(firstError.message);
        setLoading(false);
        return;
      }
      const total = totalRes.count ?? 0;
      const draft = draftRes.count ?? 0;
      const needs_review = needsRes.count ?? 0;
      const verified = verifiedRes.count ?? 0;
      const unlabeled = Math.max(0, total - (draft + needs_review + verified));
      setTotals({ all: total, unlabeled, draft, needs_review, verified });
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectIdsKey, refetchTick]);

  return { totals, loading, error, refetch };
}
