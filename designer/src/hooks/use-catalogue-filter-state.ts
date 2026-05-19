import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_CATALOGUE_VIEW_BY, type CatalogueViewBy } from '../lib/catalogue-activity';
import { DEFAULT_CATALOGUE_SORT, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueQueryFilters } from './use-catalogue-data';

const SEARCH_DEBOUNCE_MS = 300;
const PENDING_GROUP_FILTER_KEY = 'agentux:pending-group-filter';

// Lazy initial state for `filterGroup`. If the user clicked a group on
// the login page (BokehBackdrop), that key is in localStorage waiting
// to be consumed. Reading + removing it in the useState initialiser
// avoids a flash of unfiltered catalogue and a second render. Returns
// `[]` when there's no pending filter or storage isn't available.
function readPendingGroupFilter(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const pending = window.localStorage.getItem(PENDING_GROUP_FILTER_KEY);
    if (!pending) return [];
    window.localStorage.removeItem(PENDING_GROUP_FILTER_KEY);
    const trimmed = pending.trim().toLowerCase();
    return trimmed ? [trimmed] : [];
  } catch {
    return [];
  }
}

/**
 * Owns filter UI state independently from data fetching. The values returned
 * here feed into `useCatalogueData` as query args, and the same state also
 * drives the UI (dropdowns, search input, sort/view toggles).
 *
 * Search is debounced: the raw `searchQuery` updates immediately (keeps the
 * input responsive) while `searchQueryDebounced` lags by 300ms so we don't
 * fire a Supabase query per keystroke.
 */
export function useCatalogueFilterState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryDebounced, setSearchQueryDebounced] = useState('');
  const [filterGroup, setFilterGroup] = useState<string[]>(readPendingGroupFilter);
  const [filterFlow, setFilterFlow] = useState<string[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterWebPreset, setFilterWebPreset] = useState<string | null>(null);
  const [filterMobileOs, setFilterMobileOs] = useState<string | null>(null);
  const [filterAnnotation, setFilterAnnotation] = useState<string[]>([]);
  const [filterPageType, setFilterPageType] = useState<string[]>([]);
  const [filterUiElement, setFilterUiElement] = useState<string[]>([]);
  const [filterUxPattern, setFilterUxPattern] = useState<string[]>([]);
  const [filterScreenState, setFilterScreenState] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<CatalogueSortOption>(DEFAULT_CATALOGUE_SORT);
  const [viewBy, setViewBy] = useState<CatalogueViewBy>(DEFAULT_CATALOGUE_VIEW_BY);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQueryDebounced(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  // Reset web preset / mobile OS filters when platform changes away
  useEffect(() => {
    if (filterPlatform !== 'web' && filterWebPreset) setFilterWebPreset(null);
    if (filterPlatform !== 'mobile' && filterMobileOs) setFilterMobileOs(null);
  }, [filterMobileOs, filterPlatform, filterWebPreset]);

  const filters = useMemo<CatalogueQueryFilters>(() => ({
    group: filterGroup,
    flow: filterFlow,
    platform: filterPlatform as 'web' | 'mobile' | null,
    theme: filterTheme as 'light' | 'dark' | null,
    webPreset: filterWebPreset,
    mobileOs: filterMobileOs as 'ios' | 'android' | null,
    annotation: filterAnnotation,
    pageType: filterPageType,
    uiElement: filterUiElement,
    uxPattern: filterUxPattern,
    screenState: filterScreenState,
  }), [
    filterAnnotation,
    filterFlow,
    filterGroup,
    filterMobileOs,
    filterPageType,
    filterPlatform,
    filterScreenState,
    filterTheme,
    filterUiElement,
    filterUxPattern,
    filterWebPreset,
  ]);

  // Wipes every filter + search + sort back to defaults. Used by the
  // "Explore New" affordance on the empty-state, and any other "start
  // fresh" callsite. View mode is intentionally NOT reset — that's a
  // long-lived user preference, not a filter.
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterGroup([]);
    setFilterFlow([]);
    setFilterPlatform(null);
    setFilterTheme(null);
    setFilterWebPreset(null);
    setFilterMobileOs(null);
    setFilterAnnotation([]);
    setFilterPageType([]);
    setFilterUiElement([]);
    setFilterUxPattern([]);
    setFilterScreenState(null);
    setSortBy(DEFAULT_CATALOGUE_SORT);
  }, []);

  return {
    clearAllFilters,
    filters,
    filterAnnotation,
    filterFlow,
    filterGroup,
    filterMobileOs,
    filterPageType,
    filterPlatform,
    filterScreenState,
    filterTheme,
    filterUiElement,
    filterUxPattern,
    filterWebPreset,
    searchQuery,
    searchQueryDebounced,
    setFilterAnnotation,
    setFilterFlow,
    setFilterGroup,
    setFilterMobileOs,
    setFilterPageType,
    setFilterPlatform,
    setFilterScreenState,
    setFilterTheme,
    setFilterUiElement,
    setFilterUxPattern,
    setFilterWebPreset,
    setSearchQuery,
    setSortBy,
    setViewBy,
    sortBy,
    viewBy,
  };
}
