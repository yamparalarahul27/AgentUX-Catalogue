import { useEffect, useMemo, useState } from 'react';

import type { FeatureLogStatus } from '../types';
import type { FeatureLogQueryFilters } from './use-feature-log';

const SEARCH_DEBOUNCE_MS = 300;

export function useFeatureLogFilterState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryDebounced, setSearchQueryDebounced] = useState('');
  const [status, setStatus] = useState<FeatureLogStatus | 'all'>('all');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQueryDebounced(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const filters = useMemo<FeatureLogQueryFilters>(() => ({
    createdBy: null,
    search: searchQueryDebounced,
    status,
  }), [searchQueryDebounced, status]);

  return {
    filters,
    searchQuery,
    setSearchQuery,
    setStatus,
    status,
  };
}
