import { useEffect, useMemo, useState } from 'react';

import { DEFAULT_CATALOGUE_VIEW_BY, type CatalogueViewBy } from '../lib/catalogue-activity';
import { DEFAULT_CATALOGUE_SORT, type CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueQueryFilters } from './use-catalogue-data';

const SEARCH_DEBOUNCE_MS = 300;

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
  const [filterGroup, setFilterGroup] = useState<string[]>([]);
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

  return {
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
