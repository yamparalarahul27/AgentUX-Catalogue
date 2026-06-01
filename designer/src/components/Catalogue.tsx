import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import type { ScreenshotNode, WebPreset } from '../types';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useCanvasGalleryEnabled } from '../lib/canvas-gallery-prefs';
import { useIsAdmin } from '../lib/auth-passcode';
import { useCapability, useMyRole } from '../hooks/use-role-capabilities';
import { MARKETING_BUCKET_GROUP } from '../lib/marketing-bucket';
import { copySingleScreenshotShareLink } from '../lib/copy-single-share-link';
import { useCatalogueData } from '../hooks/use-catalogue-data';
import { useCatalogueFamilyActions } from '../hooks/use-catalogue-family-actions';
import { useCatalogueFilterState } from '../hooks/use-catalogue-filter-state';
import { useCatalogueFilters } from '../hooks/use-catalogue-filters';
import { invalidateCatalogueFullScopeCache, useCatalogueFullScope } from '../hooks/use-catalogue-full-scope';
import { useCatalogueGuestGuards } from '../hooks/use-catalogue-guest-guards';
import { useCatalogueSettings } from '../hooks/use-catalogue-settings';
import { useCatalogueUpload } from '../hooks/use-catalogue-upload';
import { usePasteToUpload } from '../hooks/use-paste-to-upload';
import { useDropToUpload } from '../hooks/use-drop-to-upload';
import { useCatalogueSearchShortcut } from '../hooks/use-catalogue-search-shortcut';
import { buildCatalogueFamilies, buildSyntheticFamilyFromScreenshot, getActiveFamilyVariant } from '../lib/catalogue-families';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import {
  deriveGroupStats,
  loadGroupSortMode,
  persistGroupSortMode,
  sortGroups,
  type CatalogueGroupSortMode,
} from '../lib/catalogue-group-stats';
import {
  CATALOGUE_CHIP_RECENCY_HOURS,
  CATALOGUE_CHIP_STRIP_ENABLED,
  LABELING_STUDIO_ENABLED,
  LABELING_STUDIO_MIN_VIEWPORT_PX,
} from '../lib/feature-flags';
import { buildPresetUsage, defaultGridDensity, defaultViewMode, persistGridDensity, persistViewMode } from '../lib/catalogue-helpers';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueBulkBar } from './CatalogueBulkBar';
import { CatalogueBulkFlowDialog } from './CatalogueBulkFlowDialog';
import { CatalogueBulkGroupDialog } from './CatalogueBulkGroupDialog';
import { CatalogueBulkRenameModal } from './CatalogueBulkRenameModal';
import { CatalogueContent } from './CatalogueContent';
import { CatalogueFlowStrip } from './CatalogueFlowStrip';
import { CatalogueDropOverlay } from './CatalogueDropOverlay';
import { CatalogueUploadProgress } from './CatalogueUploadProgress';
import { CatalogueShareModal } from './CatalogueShareModal';
import { CatalogueSearchModal } from './CatalogueSearchModal';
import { CatalogueFamilyLightbox } from './CatalogueFamilyLightbox';
import { CatalogueHeader } from './CatalogueHeader';
import { CatalogueQuickUploadModal } from './CatalogueQuickUploadModal';
import { CatalogueScrollToTop } from './CatalogueScrollToTop';
import { CatalogueSettingsModal } from './CatalogueSettingsModal';
import { CatalogueTeamSection } from './CatalogueTeamSection';
import { CatalogueLabelingStudio } from './labeling/CatalogueLabelingStudio';
import { useLabelingStudioTotals } from '../hooks/use-labeling-studio-totals';
import type { ScreenshotLabel } from '../lib/labeling/types';
import { deriveLabelFilterValues } from '../lib/labeling/derive-filter-values';
import { CatalogueGroupChipStrip } from './CatalogueGroupChipStrip';
import { CatalogueMagnifiedDock } from './CatalogueMagnifiedDock';
import { useViewportWidth } from '../hooks/use-viewport-width';
import {
  CatalogueToolbar,
  DEFAULT_FLOW_PRESENTATION,
  FLOW_PRESENTATION_KEY,
  parseFlowPresentation,
  type FlowPresentation,
} from './CatalogueToolbar';
import { WhatsNewPanel, getWhatsNewUnseenCount, markAllWhatsNewSeen } from './WhatsNewPanel';
import { useSaveTrashAnimation } from './SaveTrashAnimation';
import { getCachedWhatsNewReleases, loadWhatsNewReleases } from '../data/whats-new';
import { AppUpdateToast } from './AppUpdateToast';
import { CatalogueUploadModal } from './CatalogueUploadModal';
import { CatalogueVideosSection } from './CatalogueVideosSection';
import { CatalogueLinksSection } from './CatalogueLinksSection';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';
interface CatalogueProps {
  user: User;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
}

type CatalogueSection =
  | 'catalogue'
  | 'videos'
  | 'links'
  | 'team'
  | 'studio';

export function Catalogue({
  user,
  onLogout,
  onLogoutEverywhere,
}: CatalogueProps) {
  // Post-auth-gate: every renderer of this component is authenticated.
  // Kept as a local const so the existing `!isGuest` / `isGuest && …`
  // references downstream don't need to be touched.
  const isGuest = false;
  // Filter UI state (owns filter/sort/search/viewBy state, with debounced search)
  const filterState = useCatalogueFilterState();
  const {
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
  } = filterState;

  // Paginated, server-filtered data
  const {
    flowMap,
    hasMore,
    loadData,
    loading,
    loadingMore,
    loadMore,
    screenFamilies,
    screenshots,
    setScreenFamilies,
    setScreenshots,
  } = useCatalogueData({
    filters,
    sortBy,
    searchQuery: searchQueryDebounced,
  });

  const { saveWebPresets, presetByKey, webPresets } = useCatalogueSettings(user.id);
  // Data is pre-filtered by useCatalogueData
  const scopedScreenshots = screenshots;
  const scopedScreenFamilies = screenFamilies;
  const {
    annotatedScreenshotIds,
    annotationLabels,
    commentedScreenshotIds,
    screenshots: fullScopeScreenshots,
    setScreenshots: setFullScopeScreenshots,
  } = useCatalogueFullScope({
    includeCommentedScreenshots: viewBy === 'comments-added',
    includeAnnotatedScreenshots: viewBy === 'annotations-added',
  });
  const facetScreenshots = useMemo(() => {
    if (viewBy === 'all') {
      return fullScopeScreenshots;
    }

    if (viewBy === 'annotations-added') {
      return fullScopeScreenshots.filter((screenshot) => annotatedScreenshotIds.has(screenshot.id));
    }

    return fullScopeScreenshots.filter((screenshot) => commentedScreenshotIds.has(screenshot.id));
  }, [annotatedScreenshotIds, commentedScreenshotIds, fullScopeScreenshots, viewBy]);

  // Chip strip state — group sort + URL ?group= param. Active group key is
  // derived from filterGroup (single value) so chip strip and toolbar dropdown
  // stay in sync. URL is the source of truth for shareable links.
  const [groupSortMode, setGroupSortMode] = useState<CatalogueGroupSortMode>(loadGroupSortMode);
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);

  useEffect(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return;
    const params = new URLSearchParams(window.location.search);
    const initialGroup = params.get('group');
    if (initialGroup) {
      setFilterGroup([initialGroup]);
    }
    function handlePop() {
      const next = new URLSearchParams(window.location.search).get('group');
      setFilterGroup(next ? [next] : []);
    }
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return;
    const unsubscribe = subscribeCatalogueGroupAppearance(() => {
      setAppearanceMap(readCatalogueGroupAppearanceMap());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return;
    void ensureCatalogueGroupAppearanceLoaded(null);
  }, [null]);

  useEffect(() => {
    persistGroupSortMode(groupSortMode);
  }, [groupSortMode]);

  const groupStats = useMemo(
    () => (CATALOGUE_CHIP_STRIP_ENABLED ? deriveGroupStats(fullScopeScreenshots) : []),
    [fullScopeScreenshots],
  );

  // Label-derived filter chip pools (Phase 4). Only labels in active use show
  // up — keeps the public catalogue UI clean while vocab is being filled in.
  const labelFilterValues = useMemo(
    () => deriveLabelFilterValues(fullScopeScreenshots),
    [fullScopeScreenshots],
  );

  const groupOrder = useMemo(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return undefined;
    const ordered = sortGroups(
      groupStats,
      groupSortMode,
      (key) => resolveCatalogueGroupAppearance(appearanceMap, key, null).label || key,
    );
    return ordered.map((item) => item.groupKey);
  }, [appearanceMap, null, groupSortMode, groupStats]);

  const navigate = useNavigate();
  const { triggerDelete } = useSaveTrashAnimation();

  // Group View redirect: when sortBy === 'name-asc' (Group View) AND a
  // single group becomes the active filter (via toolbar dropdown, search
  // modal pick, Team-section row click, URL hydration, etc.), jump to
  // that group's detail page instead of leaving the Group View grid in
  // a single-card state. Mirrors Option C from the design discussion —
  // "narrow to one group" naturally maps to "view that group" while
  // browsing the overview.
  useEffect(() => {
    if (sortBy !== 'name-asc') return;
    if (filterGroup.length === 0) return;
    const slug = filterGroup[0].trim().toLowerCase();
    if (!slug) return;
    setFilterGroup([]);
    navigate(`/g/${encodeURIComponent(slug)}`);
  }, [sortBy, filterGroup, navigate, setFilterGroup]);

  function handleSelectChipGroup(canonicalKey: string | null) {
    if (!canonicalKey) {
      setFilterGroup([]);
    } else {
      // Expand the canonical key to every raw casing in the project so the
      // filter resolves "Coinbase" + "coinbase" under one chip click.
      const stat = groupStats.find((item) => item.groupKey === canonicalKey);
      setFilterGroup(stat ? stat.rawKeys : [canonicalKey]);
    }
    const params = new URLSearchParams(window.location.search);
    if (canonicalKey) params.set('group', canonicalKey);
    else params.delete('group');
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.pushState({}, '', url);
  }

  // The active chip is determined by case-insensitive match against any
  // currently-filtered raw casing.
  const activeChipGroupKey = filterGroup.length > 0 ? filterGroup[0].toLowerCase() : null;

  // Reconcile a lowercase/canonical group filter (from `?group=X`,
  // a bokeh-backdrop login click, or a shared link) with the actual
  // raw casings stored on `screenshots.group`. The dropdown options
  // and the SQL `IN (...)` match are case-sensitive, so when
  // filterGroup carries a normalized form we need to swap it for
  // every raw casing the project actually contains before the query
  // can return rows.
  //
  // Earlier the bail was `stat.rawKeys.length <= 1` — that skipped
  // the single-casing case, leaving a bokeh-seeded lowercase value
  // mismatched with the one real raw casing. Now we just check if
  // the sets already match.
  useEffect(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return;
    if (filterGroup.length !== 1) return;
    const canonical = filterGroup[0].toLowerCase();
    const stat = groupStats.find((item) => item.groupKey === canonical);
    if (!stat) return;
    const sameSet = stat.rawKeys.length === filterGroup.length
      && stat.rawKeys.every((key) => filterGroup.includes(key));
    if (!sameSet) {
      setFilterGroup(stat.rawKeys);
    }
  }, [filterGroup, groupStats, setFilterGroup]);

  // Derivations over loaded (and already-filtered) screenshots
  const {
    allFlows,
    allGroups,
    allMobileOs,
    allWebPresets,
    filteredFamilies: rawFilteredFamilies,
    groupedFamilies: rawGroupedFamilies,
    isSortLocked,
  } = useCatalogueFilters({
    screenshots: scopedScreenshots,
    facetScreenshots,
    screenFamilies: scopedScreenFamilies,
    webPresets,
    sortBy,
    viewBy,
    groupOrder,
  });

  // Per-email bookmarks. Identity comes from the same login email that
  // powers comments + annotations + label review — one identity, one key.
  const bookmarks = useBookmarks(user.email);
  const [bookmarkFilterOn, setBookmarkFilterOn] = useState(false);

  // Apply bookmark filter on top of the standard filter pass. A family
  // is shown if any of its variants is bookmarked.
  const filteredFamilies = useMemo(() => {
    if (!bookmarkFilterOn) return rawFilteredFamilies;
    return rawFilteredFamilies.filter((family) => (
      family.variants.some((variant) => bookmarks.bookmarkedIds.has(variant.id))
    ));
  }, [bookmarkFilterOn, rawFilteredFamilies, bookmarks.bookmarkedIds]);

  const groupedFamilies = useMemo(() => {
    if (!bookmarkFilterOn) return rawGroupedFamilies;
    const next: typeof rawGroupedFamilies = {};
    for (const [groupKey, families] of Object.entries(rawGroupedFamilies)) {
      const kept = families.filter((family) => (
        family.variants.some((variant) => bookmarks.bookmarkedIds.has(variant.id))
      ));
      if (kept.length > 0) next[groupKey] = kept;
    }
    return next;
  }, [bookmarkFilterOn, rawGroupedFamilies, bookmarks.bookmarkedIds]);
  const [showSettings, setShowSettings] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  // What's New panel open / unseen count. Auto-opens on first
  // render after a reload triggered by the App-update toast — a
  // sessionStorage flag (`agentux:open-whats-new-after-refresh`)
  // carries that intent across the reload.
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (window.sessionStorage.getItem('agentux:open-whats-new-after-refresh') === '1') {
        window.sessionStorage.removeItem('agentux:open-whats-new-after-refresh');
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });
  const [whatsNewUnseen, setWhatsNewUnseen] = useState(() => getWhatsNewUnseenCount());
  // Eager-fetch the release feed on app mount so the badge updates
  // as soon as the JSON resolves. Without this, the badge starts at
  // 0 and only updates when the user opens the panel.
  useEffect(() => {
    void loadWhatsNewReleases().then(() => setWhatsNewUnseen(getWhatsNewUnseenCount()));
  }, []);
  // Recompute unseen count when the panel closes — the close handler
  // stamps the latest release as seen, so the badge should drop to 0.
  useEffect(() => {
    if (!showWhatsNew) setWhatsNewUnseen(getWhatsNewUnseenCount());
  }, [showWhatsNew]);
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);
  // When the lightbox is opened from a screenshot-specific source
  // (search-result click), this hint disambiguates which exact
  // screenshot within the family should render, since multiple
  // variants can share the same `theme:platform:preset` key.
  const [previewScreenshotHint, setPreviewScreenshotHint] = useState<string | null>(null);
  const [previewStartInlineEdit, setPreviewStartInlineEdit] = useState(false);
  const [pendingPreviewNext, setPendingPreviewNext] = useState(false);
  // Synthetic family used by search-result clicks. The search modal
  // hands us the full ScreenshotNode at click time, and we build a
  // one-variant family from it on the fly — bypassing the family-map
  // resolution entirely, which was the source of the "wrong screenshot
  // opens" bug. When set, the lightbox renders this in place of the
  // fullScopeFamilyById lookup.
  const [previewFamilyOverride, setPreviewFamilyOverride] = useState<CatalogueFamilyView | null>(null);
  const [recentlyViewedFamilyId, setRecentlyViewedFamilyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'group' | 'flow' | null>(null);
  const [bulkFlowValue, setBulkFlowValue] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [viewMode, setViewMode] = useState<CatalogueViewMode>(defaultViewMode);
  const [canvasGalleryEnabled] = useCanvasGalleryEnabled();
  // Canvas-gallery is active only when the user is in Gallery view AND
  // the personal "Canvas view" setting is on. Drives the chrome class
  // that hides toolbar / dock / sparkles + floats the header items.
  const canvasGalleryActive = viewMode === 'gallery' && canvasGalleryEnabled;
  const [gridDensity, setGridDensity] = useState<GridDensity>(defaultGridDensity);

  // Flow presentation (dropdown vs strip) — owned here so both the
  // toolbar's Flow control and the chip strip below can react to it.
  // Lazy-init from localStorage; toolbar drives changes via callback.
  const [flowPresentation, setFlowPresentation] = useState<FlowPresentation>(() => {
    if (typeof window === 'undefined') return DEFAULT_FLOW_PRESENTATION;
    try {
      return parseFlowPresentation(window.localStorage.getItem(FLOW_PRESENTATION_KEY));
    } catch {
      return DEFAULT_FLOW_PRESENTATION;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(FLOW_PRESENTATION_KEY, flowPresentation);
    } catch {
      // ignore persistence failures
    }
  }, [flowPresentation]);

  // Mirror just the "is Flow visible?" bit from the toolbar's
  // Filters ▾ menu so the strip can be conditionally rendered.
  // Seeded from the same localStorage key the toolbar uses.
  const [flowFilterEnabled, setFlowFilterEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem('catalogue:toolbar-visible-filters');
      if (!raw) return true; // default visible includes 'flow'
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) && parsed.includes('flow');
    } catch {
      return true;
    }
  });
  // Pre-auth-gate this opened a spoofable email-prompt modal. The gate
  // now blocks unauthenticated users before they reach this component;
  // the callsites below stay only because they're guarded by conditions
  // that can't fire post-auth (e.g. `!user.email`, `isGuest`).
  const setShowAuthPrompt = (_value: boolean) => {};
  // Admin gate is backed by the `admins` table (auth-gate work). The
  // hook returns null while loading; treat that as "not admin yet" so
  // we never flash admin chrome to a non-admin during the initial fetch.
  const isAdminResult = useIsAdmin();
  const canAdmin = isAdminResult === true;
  // Capability gates. useIsAdmin still drives Members/Flags visibility for
  // PR A0 (the legacy admins table works); these new gates control the
  // affordances that non-admin roles also have or don't have.
  const canUpload = useCapability('upload');
  const canShare = useCapability('share');
  const canLabelingStudio = useCapability('labeling_studio');
  const viewportWidth = useViewportWidth();
  // Magnified dock replaces the chip strip on desktop; the strip
  // still renders on mobile (<768px) where the dock would be cramped.
  const isMobileViewport = viewportWidth < 768;
  const canDeleteAny = useCapability('delete_any');
  const canDeleteOwn = useCapability('delete_own');
  const canEditMetadata = useCapability('edit_metadata');
  const myRole = useMyRole();
  const isMarketingRole = myRole === 'marketing';
  // Ownership-aware predicates. Family-level checks require every
  // variant to match (RLS is per-row, so a mixed-ownership family would
  // delete partially — hide the affordance entirely to avoid that UX).
  const myEmailLower = user.email?.toLowerCase() ?? null;
  const canDeleteFamily = useCallback((family: CatalogueFamilyView) => {
    if (canDeleteAny) return true;
    if (!canDeleteOwn || !myEmailLower) return false;
    return family.variants.every(
      (variant) => variant.screenshot.uploader_email?.toLowerCase() === myEmailLower,
    );
  }, [canDeleteAny, canDeleteOwn, myEmailLower]);
  const canEditFamily = useCallback((family: CatalogueFamilyView) => {
    if (canEditMetadata) return true;
    // Path A: owner-edits are allowed via the delete_own RLS policy.
    if (!canDeleteOwn || !myEmailLower) return false;
    return family.variants.every(
      (variant) => variant.screenshot.uploader_email?.toLowerCase() === myEmailLower,
    );
  }, [canEditMetadata, canDeleteOwn, myEmailLower]);
  const [activeSection, setActiveSection] = useState<CatalogueSection>('catalogue');
  // Splash → 3D fall-in motion. Plays once per session: after the boot
  // splash hides on cold launch, header / chip strip / sidebar / cards
  // stagger in from above with a blur + tilt. Subsequent route re-mounts
  // skip the animation. Gated by sessionStorage.
  const [playSplashFall] = useState(() => {
    try {
      if (window.sessionStorage.getItem('agentux:splash-played') === '1') return false;
      window.sessionStorage.setItem('agentux:splash-played', '1');
      return true;
    } catch {
      return false;
    }
  });

  // The .is-splash-falling class carries `perspective: 1200px` on the
  // page root. That creates a containing block for any descendant with
  // `position: fixed` — meaning the toast, AppUpdateToast, etc. would
  // scroll WITH the page instead of staying anchored to the viewport
  // (CSS spec: transform/perspective/filter on an ancestor overrides
  // fixed positioning). So the class must come off after the chrome
  // animation completes, otherwise uploads / scrolls cause fixed UI
  // to mis-render. Chrome anim: 140ms delay (sidebar) + 900ms = 1040ms.
  const [splashFallActive, setSplashFallActive] = useState(playSplashFall);
  useEffect(() => {
    if (!splashFallActive) return;
    const handle = window.setTimeout(() => setSplashFallActive(false), 1300);
    return () => window.clearTimeout(handle);
  }, [splashFallActive]);
  const allFamilies = useMemo(
    () => buildCatalogueFamilies(scopedScreenshots, scopedScreenFamilies, presetByKey),
    [presetByKey, scopedScreenFamilies, scopedScreenshots],
  );

  // Splash fall-in — second phase. Chrome (header / chips / sidebar)
  // animates on first mount via `is-splash-falling`. Cards arrive later
  // (after the skeleton resolves), so we toggle a *separate* class
  // when the first batch of real families lands. useLayoutEffect runs
  // before paint, so the class is on the page when the cards' first
  // pixels would otherwise show — they start in the animation's 0%
  // keyframe (opacity 0, translated up, blurred) and fall in.
  //
  // A ref guard ensures load-more pagination doesn't re-trigger the
  // animation on subsequent batches; the class also auto-clears after
  // ~2.3s so any cards that mount post-window render instantly.
  const cardsArrivingPlayedRef = useRef(false);
  const [cardsArriving, setCardsArriving] = useState(false);
  useLayoutEffect(() => {
    if (!playSplashFall) return;
    if (cardsArrivingPlayedRef.current) return;
    if (loading || allFamilies.length === 0) return;
    cardsArrivingPlayedRef.current = true;
    setCardsArriving(true);
    const handle = window.setTimeout(() => setCardsArriving(false), 2300);
    return () => window.clearTimeout(handle);
  }, [playSplashFall, loading, allFamilies.length]);
  const familyById = useMemo(
    () => Object.fromEntries(allFamilies.map((family) => [family.id, family])),
    [allFamilies],
  );
  // Parallel family map built from the FULL catalogue (not the
  // filter-scoped subset). The lightbox preview uses this so that
  // every variant of the previewed family is available — without
  // this, a screenshot opened from the search modal (which searches
  // full scope) may resolve to a family whose loaded variants don't
  // include the specific one the user clicked, falling back to
  // whichever variant happens to be `variants[0]`.
  const fullScopeFamilyById = useMemo(
    () => Object.fromEntries(
      buildCatalogueFamilies(fullScopeScreenshots, scopedScreenFamilies, presetByKey)
        .map((family) => [family.id, family]),
    ),
    [fullScopeScreenshots, scopedScreenFamilies, presetByKey],
  );
  // Reverse map for the Studio's "click a card to open the lightbox"
  // path. Sourced from `fullScopeFamilyById` (full unfiltered set, built
  // from fullScopeScreenshots) rather than the catalogue's filter-scoped
  // `allFamilies` — otherwise clicks on Studio screenshots that live
  // outside the catalogue's current filter window resolve to nothing
  // and the lightbox silently fails to open. (Bug from PR #203 when the
  // Studio's screenshots prop was switched to the full scope.)
  const screenshotIdToFamilyId = useMemo(() => {
    const map = new Map<string, string>();
    for (const family of Object.values(fullScopeFamilyById)) {
      for (const variant of family.variants) {
        map.set(variant.id, family.id);
      }
    }
    return map;
  }, [fullScopeFamilyById]);
  const [studioLabelOverrides, setStudioLabelOverrides] = useState<Map<string, ScreenshotLabel>>(new Map());
  const studioTotals = useLabelingStudioTotals();

  // Push a freshly-saved label into both screenshots arrays so consumers
  // reading `metadata.label` directly (lightbox AI anchors, ui_elements
  // chip-strip on cards, etc.) see the new data without a page refresh.
  // Same dual-scope discipline as every screenshot mutation. Studio
  // bits — overrides map + DB-direct totals refetch — only run when the
  // user is actually in the Studio surface.
  const handleLabelPersisted = useCallback((screenshotId: string, label: ScreenshotLabel) => {
    const updateMeta = (screenshot: ScreenshotNode): ScreenshotNode => {
      if (screenshot.id !== screenshotId) return screenshot;
      const metadata = (screenshot.metadata as Record<string, unknown> | null) ?? {};
      return { ...screenshot, metadata: { ...metadata, label } };
    };
    setScreenshots((previous) => previous.map(updateMeta));
    setFullScopeScreenshots((previous) => previous.map(updateMeta));
    if (activeSection === 'studio') {
      setStudioLabelOverrides((previous) => {
        const next = new Map(previous);
        next.set(screenshotId, label);
        return next;
      });
      studioTotals.refetch();
    }
  }, [activeSection, setFullScopeScreenshots, setScreenshots, studioTotals]);
  const handleStudioCardClick = useCallback((screenshotId: string) => {
    const familyId = screenshotIdToFamilyId.get(screenshotId);
    if (!familyId) return;
    // Mirror the Search modal's open-screenshot path: set the screenshot
    // hint AND the family ID. Without the hint, the lightbox falls back
    // to the family's primary variant (usually the latest by date), so
    // clicking an older screenshot would land on the newest variant
    // within the same family. setPreviewStartInlineEdit kept false so
    // the lightbox opens in view mode, not the labeling editor.
    setPreviewStartInlineEdit(false);
    setPreviewScreenshotHint(screenshotId);
    setPreviewFamilyId(familyId);
  }, [screenshotIdToFamilyId]);
  const presetUsage = useMemo(() => buildPresetUsage(scopedScreenshots), [scopedScreenshots]);
  const selectedVisibleCount = useMemo(
    () => filteredFamilies.filter((family) => selected.has(family.id)).length,
    [filteredFamilies, selected],
  );
  // Prefer the full-scope family for the lightbox so every variant is
  // present (search-result clicks can target screenshots outside the
  // current filter or pagination window). Falls back to the scoped
  // map if for some reason the full scope hasn't hydrated yet.
  // Override takes precedence so search-result clicks can render their
  // synthetic family without competing with the (potentially-still-
  // hydrating) full-scope lookup.
  const previewFamily = previewFamilyOverride
    ?? (previewFamilyId
      ? (fullScopeFamilyById[previewFamilyId] ?? familyById[previewFamilyId] ?? null)
      : null);
  const {
    handleAnnotationStateChange,
    handleChangeFamilyGroup,
    handleCommentCountChange,
    handleCropFamilyImage,
    handleDeleteFamily,
    handleRenameFamily,
    handleRenameGroupKey,
    handleRemoveReference,
    handleSetReference,
    handleReplaceImage,
    handleSetFlowLabel,
    handleUpdateVariantDetails,
  } = useCatalogueFamilyActions({
    familyById,
    flowMap,
    onFamilyDeleted: (familyId) => {
      setPreviewFamilyId((previous) => {
        if (previous !== familyId) return previous;
        const idx = filteredFamilies.findIndex((family) => family.id === familyId);
        if (idx < 0) return null;
        const neighbor = filteredFamilies[idx + 1] ?? filteredFamilies[idx - 1];
        return neighbor ? neighbor.id : null;
      });
      setPreviewStartInlineEdit(false);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(familyId);
        return next;
      });
    },
    screenFamilies: scopedScreenFamilies,
    screenshots: scopedScreenshots,
    setFullScopeScreenshots,
    setScreenFamilies,
    setScreenshots,
    setToast,
    userEmail: user.email,
    userId: user.id,
    webPresets,
    // Trash today is only reachable via Settings → Team, which is
    // admin-only — so non-admins can't restore. Show the simpler
    // "Deleted." toast for them instead of the "Moved to Trash" copy.
    canSeeTrash: canAdmin,
  });
  const upload = useCatalogueUpload({
    allFamilies,
    fullScopeScreenshots,
    setScreenshots,
    setFullScopeScreenshots,
    setToast,
    userEmail: user.email || null,
    userId: user.id,
    webPresets,
  });
  // Marketing role's Quick Upload group is locked to the Marketing Bucket
  // constant — pin the underlying state so the upload payload matches
  // what the locked-pill UI shows. Depends on the value (not the whole
  // `upload` object) so this doesn't loop on every render.
  useEffect(() => {
    if (isMarketingRole && upload.quickUploadGroup !== MARKETING_BUCKET_GROUP) {
      upload.setQuickUploadGroup(MARKETING_BUCKET_GROUP);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketingRole, upload.quickUploadGroup]);

  // Single-screenshot share — copy URL to clipboard + toast. Wired to
  // the lightbox icon-bar button and the card hover overlay.
  const handleShareSingleScreenshot = useCallback((screenshotId: string) => {
    void copySingleScreenshotShareLink(screenshotId, { by: user.email ?? null }).then((result) => {
      setToast(
        result.ok
          ? { message: 'Link copied', type: 'success' }
          : { message: 'Could not copy — copy from the address bar instead.', type: 'error' },
      );
    });
  }, [setToast, user.email]);

  const isAnyModalOpen = Boolean(
    upload.showUpload ||
    showSettings ||
    previewFamily ||
    bulkAction ||
    confirmDeleteOpen,
  );
  const {
    guardAction,
    requireEditAccess,
    handleGuestAwareChangeFamilyGroup,
    handleGuestAwareCropFamilyImage,
    handleGuestAwareDeleteFamily,
    handleGuestAwareRemoveReference,
    handleGuestAwareRenameFamily,
    handleGuestAwareReplaceImage,
    handleGuestAwareSetFlowLabel,
    handleGuestAwareSetReference,
    handleGuestAwareUpdateVariantDetails,
  } = useCatalogueGuestGuards({
    isGuest,
    onRequireAuth: () => setShowAuthPrompt(true),
    handleChangeFamilyGroup,
    handleCropFamilyImage,
    handleDeleteFamily,
    handleRemoveReference,
    handleRenameFamily,
    handleReplaceImage,
    handleSetFlowLabel,
    handleSetReference,
    handleUpdateVariantDetails,
  });
  useEffect(() => {
    persistViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    persistGridDensity(gridDensity);
  }, [gridDensity]);

  // Track the previewed family's last-known position in the filtered
  // list so we can auto-advance the lightbox when the user deletes
  // the currently-open family. Without this, the post-delete state
  // would leave previewFamilyId pointing at a row that no longer
  // exists, and the catch-all effect below would just close the
  // lightbox — breaking the "delete + keep stepping" flow.
  const previewIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!previewFamilyId) {
      previewIndexRef.current = -1;
      return;
    }
    const idx = filteredFamilies.findIndex((family) => family.id === previewFamilyId);
    if (idx >= 0) previewIndexRef.current = idx;
  }, [previewFamilyId, filteredFamilies]);

  // When the previewed family disappears from the data (deleted, or
  // filtered out by an external state change), auto-advance to the
  // family that took its slot (or the new last family, or close if
  // the list is empty).
  useEffect(() => {
    if (!previewFamilyId) return;
    // Synthetic override is self-contained — don't trip the
    // "family disappeared" recovery path for it.
    if (previewFamilyOverride) return;
    if (familyById[previewFamilyId]) return; // still exists, no advance needed
    if (filteredFamilies.length === 0) {
      setPreviewFamilyId(null);
      return;
    }
    const previousIndex = previewIndexRef.current;
    const nextIndex = previousIndex < 0
      ? 0
      : Math.min(previousIndex, filteredFamilies.length - 1);
    setPreviewFamilyId(filteredFamilies[nextIndex].id);
  }, [familyById, previewFamilyId, previewFamilyOverride, filteredFamilies]);
  useEffect(() => {
    if (!canAdmin && (activeSection === 'team' || activeSection === 'studio')) {
      setActiveSection('catalogue');
    }
  }, [activeSection, canAdmin]);

  // Refresh the full-scope screenshot cache every time the user enters
  // the Studio. Module cache is otherwise warm for the page's lifetime,
  // so screenshots added since this tab opened (Telegram bot uploads,
  // teammate's uploads, etc.) wouldn't appear until a hard refresh.
  // Refetching on Studio entry is the cheapest correct behaviour —
  // we don't need to poll while the user is INSIDE the Studio.
  useEffect(() => {
    if (activeSection === 'studio' && canLabelingStudio) {
      invalidateCatalogueFullScopeCache();
    }
  }, [activeSection, canLabelingStudio]);

  // Cmd+V (or Ctrl+V) on the catalogue page reads the clipboard, queues any
  // image into Quick Upload, and opens the modal. Suppressed when an input is
  // focused so normal paste-into-field behaviour wins.
  usePasteToUpload({
    enabled: activeSection === 'catalogue',
    onPaste: (files) => {
      upload.handleQuickUploadQueueAdd(files);
      upload.setShowQuickUpload(true);
      setToast({
        message: `${files.length} image${files.length === 1 ? '' : 's'} added to Quick Upload`,
        type: 'success',
      });
    },
  });

  // Option+Space / `/` opens the categorised search
  // modal. Restricted to the catalogue section so it doesn't fire on
  // other tabs.
  useCatalogueSearchShortcut({
    enabled: activeSection === 'catalogue',
    onOpen: () => setShowSearchModal(true),
  });

  // Drag-drop files anywhere on the catalogue grid → Quick Upload queue.
  // Suppressed when the lightbox is open so editing mode isn't disrupted.
  // Top-level folders are walked one level deep; subfolders skipped. Cap at
  // 200 files per drop to protect against accidental large drops.
  const { dragActive } = useDropToUpload({
    enabled: activeSection === 'catalogue' && !previewFamilyId && !upload.showQuickUpload,
    onDrop: (files, stats) => {
      if (files.length === 0) {
        if (stats.skipped > 0) {
          setToast({
            message: `No images in drop · skipped ${stats.skipped} non-image${stats.skipped === 1 ? '' : 's'}`,
            type: 'info',
          });
        }
        return;
      }
      upload.handleQuickUploadQueueAdd(files);
      upload.setShowQuickUpload(true);
      const parts = [`${files.length} image${files.length === 1 ? '' : 's'} added to Quick Upload`];
      if (stats.skipped > 0) parts.push(`skipped ${stats.skipped} non-image${stats.skipped === 1 ? '' : 's'}`);
      if (stats.truncated > 0) parts.push(`capped at 200 (${stats.truncated} more skipped)`);
      setToast({ message: parts.join(' · '), type: 'success' });
    },
  });

  useEffect(() => {
    if (!isAnyModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isAnyModalOpen]);

  // Single-letter section + quick-upload shortcuts at the catalogue
  // page level. Mirrors the lightbox's keyboard pattern: skip when
  // typing, holding a modifier, or while any modal (incl. lightbox
  // + Quick Upload) is open. The lightbox owns C/B for crop/save
  // internally — those won't reach this handler because lightbox
  // sets previewFamily, which flips isAnyModalOpen.
  //
  //   C → Catalogue       V → Videos
  //   L → Links           I → Labelling Studio (when capable)
  //   S → Settings (Team) (when admin)
  //   U → Quick Upload    (when capable)
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (isAnyModalOpen) return;
      if (upload.showQuickUpload) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        setActiveSection('catalogue');
      } else if (key === 'v') {
        event.preventDefault();
        setActiveSection('videos');
      } else if (key === 'l') {
        event.preventDefault();
        setActiveSection('links');
      } else if (key === 'i') {
        if (!canLabelingStudio || !LABELING_STUDIO_ENABLED) return;
        if (viewportWidth < LABELING_STUDIO_MIN_VIEWPORT_PX) return;
        event.preventDefault();
        setActiveSection('studio');
      } else if (key === 's') {
        if (!canAdmin) return;
        event.preventDefault();
        setActiveSection('team');
      } else if (key === 'u') {
        if (!canUpload || activeSection !== 'catalogue') return;
        event.preventDefault();
        guardAction(() => {
          upload.seedQuickUploadFromFiltersIfFirstOpen({
            filterFlow,
            filterGroup,
            filterPlatform,
            filterTheme,
            filterWebPreset,
            filterMobileOs,
          });
          upload.setShowQuickUpload(true);
        });
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    isAnyModalOpen,
    upload,
    canAdmin,
    canLabelingStudio,
    canUpload,
    viewportWidth,
    activeSection,
    guardAction,
    filterFlow,
    filterGroup,
    filterPlatform,
    filterTheme,
    filterWebPreset,
    filterMobileOs,
  ]);

  function openPreview(familyId: string) {
    setPreviewStartInlineEdit(false);
    setPreviewScreenshotHint(null);
    setPreviewFamilyOverride(null);
    setPreviewFamilyId(familyId);
  }

  function stepPreview(direction: -1 | 1) {
    if (!previewFamilyId || filteredFamilies.length === 0) return;
    const currentIndex = filteredFamilies.findIndex((family) => family.id === previewFamilyId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < filteredFamilies.length) {
      setPreviewStartInlineEdit(false);
      setPreviewScreenshotHint(null);
      setPreviewFamilyOverride(null);
      setPreviewFamilyId(filteredFamilies[nextIndex].id);
      return;
    }
    if (direction === -1) return;
    if (!hasMore) {
      setToast({ message: 'End of catalogue', type: 'info' });
      return;
    }
    setPendingPreviewNext(true);
  }
  useEffect(() => {
    if (!pendingPreviewNext) return;
    if (!previewFamilyId) {
      setPendingPreviewNext(false);
      return;
    }
    const idx = filteredFamilies.findIndex((family) => family.id === previewFamilyId);
    if (idx < 0) {
      setPendingPreviewNext(false);
      return;
    }
    const nextIdx = idx + 1;
    if (nextIdx < filteredFamilies.length) {
      setPreviewStartInlineEdit(false);
      setPreviewFamilyId(filteredFamilies[nextIdx].id);
      setPendingPreviewNext(false);
      return;
    }
    if (!hasMore) {
      setToast({ message: 'End of catalogue', type: 'info' });
      setPendingPreviewNext(false);
      return;
    }
    if (!loadingMore) {
      void loadMore();
    }
  }, [pendingPreviewNext, previewFamilyId, filteredFamilies, hasMore, loadingMore, loadMore]);
  useEffect(() => {
    if (!recentlyViewedFamilyId) return;
    const id = recentlyViewedFamilyId;
    const element = document.querySelector<HTMLElement>(`[data-family-id="${CSS.escape(id)}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('catalogue-card--recently-viewed');
    }
    const timeout = window.setTimeout(() => {
      const stillThere = document.querySelector<HTMLElement>(`[data-family-id="${CSS.escape(id)}"]`);
      stillThere?.classList.remove('catalogue-card--recently-viewed');
      setRecentlyViewedFamilyId((current) => (current === id ? null : current));
    }, 3000);
    return () => {
      window.clearTimeout(timeout);
      const stillThere = document.querySelector<HTMLElement>(`[data-family-id="${CSS.escape(id)}"]`);
      stillThere?.classList.remove('catalogue-card--recently-viewed');
    };
  }, [recentlyViewedFamilyId]);
  function toggleSelect(familyId: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(familyId)) next.delete(familyId); else next.add(familyId); return next; });
  }
  function toggleGroupSelection(familyIds: string[]) {
    setSelected((prev) => { const next = new Set(prev); const all = familyIds.every((id) => next.has(id)); familyIds.forEach((id) => { if (all) next.delete(id); else next.add(id); }); return next; });
  }
  function selectAllVisible() {
    setSelected((prev) => { const next = new Set(prev); const all = filteredFamilies.length > 0 && filteredFamilies.every((f) => next.has(f.id)); filteredFamilies.forEach((f) => { if (all) next.delete(f.id); else next.add(f.id); }); return next; });
  }
  function clearSelection() { setSelected(new Set()); setBulkAction(null); setBulkGroupValue(''); setBulkFlowValue(''); }
  // Stagger between consecutive bulk-delete card animations (ms).
  // Each card's trash overlay runs ~2.4s (DELETE_TOTAL_MS in
  // SaveTrashAnimation), but we kick the NEXT one off after this
  // short gap so the cascade reads as a flurry, not 2.4s × N of
  // sequential theatre. Up to BULK_DELETE_ANIM_LIMIT cards animate;
  // beyond that we bypass the animation (multiple corner-docked
  // trashes stacked would just be visual chaos).
  const BULK_DELETE_STAGGER_MS = 110;
  const BULK_DELETE_ANIM_LIMIT = 8;
  async function handleBulkDelete() {
    if (!requireEditAccess() || selected.size === 0) return;
    const ids = Array.from(selected);
    // Capture the order + card rects + first screenshot URLs BEFORE
    // we start mutating local state. As cards unmount, the DOM lookup
    // below would otherwise miss them.
    type Targeted = { id: string; rect: DOMRect | null; screenshotUrl: string | null; thumbHash: string | null };
    const targets: Targeted[] = ids.map((id) => {
      const node = document.querySelector(`[data-family-id="${id}"]`);
      const rect = node instanceof HTMLElement ? node.getBoundingClientRect() : null;
      const family = familyById[id];
      const variant = family ? getActiveFamilyVariant(family, upload.activeVariantKeys[family.id]) : null;
      const screenshot = variant?.screenshot ?? null;
      return {
        id,
        rect,
        screenshotUrl: screenshot?.image_url ?? null,
        thumbHash: screenshot?.thumb_hash ?? null,
      };
    });
    clearSelection();

    // Skip animation entirely if too many items selected — fall back
    // to the legacy fast path (sequential delete, no theatre).
    if (targets.length > BULK_DELETE_ANIM_LIMIT) {
      for (const t of targets) await handleDeleteFamily(t.id);
      return;
    }

    // Trigger each card's trash animation with a stagger. Each
    // onComplete fires that card's soft-delete so rows fall off the
    // grid in sequence as their balls land in the trash.
    targets.forEach((target, index) => {
      window.setTimeout(() => {
        if (!target.rect) {
          // No DOM rect (card not visible / already unmounted) — skip
          // animation and just delete.
          void handleDeleteFamily(target.id);
          return;
        }
        triggerDelete({
          sourceRect: target.rect,
          screenshotUrl: target.screenshotUrl,
          thumbHash: target.thumbHash,
          onComplete: () => {
            void handleDeleteFamily(target.id);
          },
        });
      }, index * BULK_DELETE_STAGGER_MS);
    });
  }
  async function handleBulkChangeGroup(group: string) {
    if (!requireEditAccess()) return;
    const g = group.trim(); if (selected.size === 0 || !g) return;
    for (const id of selected) await handleChangeFamilyGroup(id, g);
    setToast({ message: `${selected.size} families moved to "${g}"`, type: 'success' });
    clearSelection();
  }
  async function handleBulkChangeFlow(flow: string) {
    if (!requireEditAccess()) return;
    const trimmed = flow.trim();
    if (selected.size === 0 || !trimmed) return;
    const count = selected.size;
    for (const id of selected) await handleSetFlowLabel(id, trimmed);
    setToast({ message: `${count} families assigned to flow "${trimmed}"`, type: 'success' });
    clearSelection();
  }
  async function handleBulkClearFlow() {
    if (!requireEditAccess()) return;
    if (selected.size === 0) return;
    const count = selected.size;
    for (const id of selected) await handleSetFlowLabel(id, null);
    setToast({ message: `Flow removed from ${count} famil${count === 1 ? 'y' : 'ies'}`, type: 'success' });
    clearSelection();
  }

  async function handleSavePresets(nextPresets: WebPreset[]) {
    if (!requireEditAccess()) return;
    const result = await saveWebPresets(nextPresets);
    setToast({
      message: result.ok ? 'Catalogue presets updated' : 'Using local preset changes until the database is ready',
      type: result.ok ? 'success' : 'info',
    });
  }
  return (
    <div className={`catalogue-page ${canAdmin ? 'catalogue-page--team-enabled' : ''}${canvasGalleryActive ? ' is-canvas-gallery-active' : ''}${splashFallActive ? ' is-splash-falling' : ''}${cardsArriving ? ' is-cards-arriving' : ''}`}>
      <CatalogueHeader
        activeSection={activeSection}
        canAdmin={canAdmin}
        canLabelingStudio={canLabelingStudio}
        onOpenSettings={() => setShowSettings(true)}
        onSectionChange={(section) => {
          if (section === 'elements') {
            navigate('/elements');
            return;
          }
          setActiveSection(section);
        }}
        userEmail={user.email ?? null}
        onSignIn={() => setShowAuthPrompt(true)}
        onLogout={() => {
          onLogout();
          setBookmarkFilterOn(false);
        }}
        onLogoutEverywhere={() => {
          onLogoutEverywhere();
          setBookmarkFilterOn(false);
        }}
        myBookmarksActive={bookmarkFilterOn}
        onToggleMyBookmarks={() => {
          if (!user.email) {
            setShowAuthPrompt(true);
            return;
          }
          setBookmarkFilterOn((previous) => !previous);
        }}
        onOpenWhatsNew={() => {
          // History icon in the header now opens the full Changelog
          // page in a new tab. The WhatsNew sheet itself stays in code
          // (still auto-opens after a build refresh via the sessionStorage
          // flag below) but is no longer manually trigger-able from here.
          window.open('/designer/changelog', '_blank', 'noopener,noreferrer');
          markAllWhatsNewSeen(getCachedWhatsNewReleases());
          setWhatsNewUnseen(0);
        }}
        whatsNewUnseenCount={whatsNewUnseen}
      />
      <WhatsNewPanel isOpen={showWhatsNew} onClose={() => setShowWhatsNew(false)} />
      <AppUpdateToast
        onRefresh={() => {
          try {
            window.sessionStorage.setItem('agentux:open-whats-new-after-refresh', '1');
          } catch {
            // ignore; panel just won't auto-open
          }
          window.location.reload();
        }}
      />
      {activeSection === 'team' && canAdmin ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueTeamSection
              screenshots={fullScopeScreenshots}
              currentUserEmail={user.email ?? ''}
              onRenameGroupKey={handleRenameGroupKey}
              onTrashRestored={() => { loadData(); invalidateCatalogueFullScopeCache(); }}
              onSelectFlow={(flow) => {
                setFilterFlow([flow]);
                setFilterGroup([]);
                setActiveSection('catalogue');
              }}
              onSelectGroup={(group) => {
                setFilterGroup([group]);
                setFilterFlow([]);
                setActiveSection('catalogue');
              }}
            />
          </div>
        </main>
      ) : activeSection === 'studio' && canLabelingStudio && LABELING_STUDIO_ENABLED ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueLabelingStudio
              // Studio works on the full unfiltered superset — the catalogue
              // toolbar's filter / search / sort must NOT bleed into here.
              // Status chip counts come from `totals` (DB-direct) and the
              // grid + chip-filtered list run off the full scope. The
              // Studio paginates internally (50 cards per page) via its
              // own IntersectionObserver — no outer pagination plumbing.
              screenshots={fullScopeScreenshots}
              overrides={studioLabelOverrides}
              // The Studio's selected-card highlight needs a SCREENSHOT
              // ID (not a family ID). `previewScreenshotHint` is what
              // `handleStudioCardClick` writes; pairing them here is what
              // gives the clicked card its ring.
              selectedScreenshotId={previewScreenshotHint}
              onCardClick={handleStudioCardClick}
              totals={studioTotals.totals}
              totalsLoading={studioTotals.loading}
            />
          </div>
        </main>
      ) : activeSection === 'videos' ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueVideosSection
              canEdit={!isGuest}
              userEmail={user.email || 'Designer'}
              onRequireAuth={() => setShowAuthPrompt(true)}
            />
          </div>
        </main>
      ) : activeSection === 'links' ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueLinksSection
              canEdit={!isGuest}
              userEmail={user.email || 'Designer'}
              onRequireAuth={() => setShowAuthPrompt(true)}
            />
          </div>
        </main>
      ) : (
        <main className={`catalogue-main${gridDensity !== 'auto' ? ` catalogue-main--density-${gridDensity}` : ''}`}>
          <div className="catalogue-shell">
            <div className="catalogue-body">
              {/* CatalogueGroupChipStrip — hidden on desktop in favour
                  of CatalogueMagnifiedDock (rendered at the bottom of
                  this component below). Stays on mobile (<768px) where
                  the dock's cursor-proximity magnification has no
                  equivalent touch interaction.
                  See docs/mockups/catalogue-magnified-dock-2026-05-16.html
                  for the dock spec. */}
              {CATALOGUE_CHIP_STRIP_ENABLED && isMobileViewport && (
                <CatalogueGroupChipStrip
                  stats={groupStats}
                  appearanceMap={appearanceMap}
                  projectId={null}
                  activeGroupKey={activeChipGroupKey}
                  sortMode={groupSortMode}
                  recencyHours={CATALOGUE_CHIP_RECENCY_HOURS}
                  onSelectGroup={handleSelectChipGroup}
                  onChangeSort={setGroupSortMode}
                />
              )}
              <CatalogueToolbar
                allFlows={allFlows}
                allMobileOs={allMobileOs}
                allWebPresets={allWebPresets}
                annotationLabels={annotationLabels}
                allPageTypes={labelFilterValues.pageTypes}
                allUiElements={labelFilterValues.uiElements}
                allUxPatterns={labelFilterValues.uxPatterns}
                allScreenStates={labelFilterValues.screenStates}
                filterAnnotation={filterAnnotation}
                filterFlow={filterFlow}
                filterGroup={filterGroup}
                filterMobileOs={filterMobileOs}
                filterPageType={filterPageType}
                filterPlatform={filterPlatform}
                filterScreenState={filterScreenState}
                filterTheme={filterTheme}
                filterUiElement={filterUiElement}
                filterUxPattern={filterUxPattern}
                filterWebPreset={filterWebPreset}
                gridDensity={gridDensity}
                groups={allGroups}
                groupAppearanceMap={appearanceMap}
                isSortLocked={isSortLocked}
                onFilterAnnotationChange={setFilterAnnotation}
                onFilterFlowChange={setFilterFlow}
                onFilterGroupChange={setFilterGroup}
                onFilterMobileOsChange={setFilterMobileOs}
                onFilterPageTypeChange={setFilterPageType}
                onFilterPlatformChange={setFilterPlatform}
                onFilterScreenStateChange={setFilterScreenState}
                onFilterThemeChange={setFilterTheme}
                onFilterUiElementChange={setFilterUiElement}
                onFilterUxPatternChange={setFilterUxPattern}
                onFilterWebPresetChange={setFilterWebPreset}
                onGridDensityChange={setGridDensity}
                onQuickUploadClick={canUpload ? () => {
                  guardAction(() => {
                    upload.seedQuickUploadFromFiltersIfFirstOpen({
                      filterFlow,
                      filterGroup,
                      filterPlatform,
                      filterTheme,
                      filterWebPreset,
                      filterMobileOs,
                    });
                    upload.setShowQuickUpload(true);
                  });
                } : undefined}
                quickUploadOpen={upload.showQuickUpload}
                quickUploadQueueCount={upload.quickUploadQueuePreview.length}
                quickUploadIsUploading={upload.uploading}
                onQuickUploadAll={() => {
                  void upload.handleQuickUploadUploadAll().then((inserted) => {
                    if (inserted.length > 0) {
                      setSelected(new Set(inserted.map((item) => item.id)));
                      // Full-scope cache is otherwise reused across route
                      // mounts — refresh it so the chip strip / Group detail
                      // page pick up the new screenshots without a reload.
                      invalidateCatalogueFullScopeCache();
                    }
                  });
                }}
                onClearAllFilters={clearAllFilters}
                onSortByChange={setSortBy}
                onViewByChange={setViewBy}
                onViewModeChange={setViewMode}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                sortBy={sortBy}
                viewBy={viewBy}
                viewMode={viewMode}
                bookmarkFilterOn={bookmarkFilterOn}
                bookmarkCount={bookmarks.bookmarkedIds.size}
                onBookmarkFilterToggle={() => {
                  if (bookmarkFilterOn) {
                    setBookmarkFilterOn(false);
                    return;
                  }
                  if (!user.email) {
                    setShowAuthPrompt(true);
                    return;
                  }
                  setBookmarkFilterOn(true);
                }}
                onOpenShare={canShare && !isGuest ? () => setShowShareModal(true) : undefined}
                onOpenSearch={() => setShowSearchModal(true)}
                flowPresentation={flowPresentation}
                onFlowPresentationChange={setFlowPresentation}
                onVisibleFiltersChange={(filters) => setFlowFilterEnabled(filters.includes('flow'))}
              />

              {flowFilterEnabled && flowPresentation === 'strip' && (
                <CatalogueFlowStrip
                  screenshots={fullScopeScreenshots}
                  filterFlow={filterFlow}
                  onToggleFlow={(flow) => {
                    setFilterFlow((current) => (
                      current.includes(flow)
                        ? current.filter((value) => value !== flow)
                        : [...current, flow]
                    ));
                  }}
                />
              )}

              {searchQuery.trim().length > 0 && (
                <div className="catalogue-search-banner" role="region" aria-label="Search results">
                  <div className="catalogue-search-banner__title">
                    <h2>
                      Search results for <span className="catalogue-search-banner__query">{searchQuery}</span>
                    </h2>
                    <span className="catalogue-search-banner__count">
                      {filteredFamilies.length} {filteredFamilies.length === 1 ? 'match' : 'matches'} in catalogue
                    </span>
                  </div>
                </div>
              )}

              <div className="catalogue-body-layout">
                <div className="catalogue-body-main">
                  <CatalogueContent
                    activeVariantKeys={upload.activeVariantKeys}
                    canEdit={!isGuest}
                    onClearFilters={clearAllFilters}
                    filterFlow={filterFlow}
                    filterGroup={filterGroup}
                    filterMobileOs={filterMobileOs}
                    filterPlatform={filterPlatform}
                    filterTheme={filterTheme}
                    filterWebPreset={filterWebPreset}
                    filteredFamilies={filteredFamilies}
                    gridDensity={gridDensity}
                    groupedFamilies={groupedFamilies}
                    fullScopeScreenshots={fullScopeScreenshots}
                    hasMore={hasMore}
                    loading={loading}
                    loadingMore={loadingMore}
                    onLoadMore={loadMore}
                    searchQuery={searchQuery}
                    selected={selected}
                    sortBy={sortBy}
                    viewMode={viewMode}
                    onActiveVariantChange={upload.updateActiveVariant}
                    onAnnotationStateChange={handleAnnotationStateChange}
                    onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
                    onCommentCountChange={handleCommentCountChange}
                    onDeleteFamily={handleGuestAwareDeleteFamily}
                    canDeleteFamily={canDeleteFamily}
                    canEditFamily={canEditFamily}
                    onOpenPreview={openPreview}
                    onRequireAuth={() => setShowAuthPrompt(true)}
                    onRenameFamily={handleGuestAwareRenameFamily}
                    onRemoveReference={handleGuestAwareRemoveReference}
                    onReplaceVariantImage={handleGuestAwareReplaceImage}
                    onSetFlowLabel={handleGuestAwareSetFlowLabel}
                    onToggleGroupSelect={toggleGroupSelection}
                    onToggleSelect={toggleSelect}
                    onUpdateVariantDetails={handleGuestAwareUpdateVariantDetails}
                    userEmail={user.email || 'Designer'}
                    webPresets={webPresets}
                    canvasGalleryEnabled={canvasGalleryEnabled}
                    onExitCanvasGallery={() => setViewMode('grid')}
                    bookmarkedIds={bookmarks.bookmarkedIds}
                    onToggleBookmark={(screenshotId) => {
                      if (!user.email) {
                        setShowAuthPrompt(true);
                        return;
                      }
                      void bookmarks.toggleBookmark(screenshotId).then((result) => {
                        if (!result.ok) {
                          setToast({ message: 'Could not update bookmark. Try again.', type: 'error' });
                        }
                      });
                    }}
                    onShareLink={handleShareSingleScreenshot}
                  />
                </div>
                <CatalogueQuickUploadModal
                  existingFlows={allFlows}
                  flowLabel={upload.quickUploadFlowLabel}
                  isOpen={upload.showQuickUpload}
                  projectId={upload.quickUploadProjectId}
                  projects={[]}
                  quickUploadGroup={upload.quickUploadGroup}
                  quickUploadProjectGroups={upload.quickUploadProjectGroups}
                  quickUploadQueue={upload.quickUploadQueuePreview}
                  isMarketingRole={isMarketingRole}
                  quickUploadSuggestedGroup={upload.quickUploadSuggestedGroup}
                  uploading={upload.uploading}
                  platform={upload.quickUploadPlatform}
                  theme={upload.quickUploadTheme}
                  webPresetKey={upload.quickUploadWebPresetKey}
                  webPresets={webPresets}
                  mobileOs={upload.quickUploadMobileOs}
                  onClose={upload.resetQuickUploadState}
                  onPlatformChange={upload.setQuickUploadPlatform}
                  onThemeChange={upload.setQuickUploadTheme}
                  onWebPresetKeyChange={upload.setQuickUploadWebPresetKey}
                  onMobileOsChange={upload.setQuickUploadMobileOs}
                  onQuickUploadClearQueue={upload.handleQuickUploadQueueClear}
                  onQuickUploadFilesSelected={upload.handleQuickUploadQueueAdd}
                  onQuickUploadFlowLabelChange={upload.setQuickUploadFlowLabel}
                  onQuickUploadGroupChange={upload.setQuickUploadGroup}
                  onQuickUploadSuggestedGroupChange={upload.setQuickUploadSuggestedGroup}
                  onQuickUploadProjectChange={upload.handleQuickUploadProjectChange}
                  onQuickUploadRemoveQueuedFile={upload.handleQuickUploadQueueRemove}
                  onQuickUploadUploadAll={() => { void upload.handleQuickUploadUploadAll().then((inserted) => {
                    if (inserted.length === 0) return;
                    setSelected(new Set(inserted.map((item) => item.id)));
                    invalidateCatalogueFullScopeCache();
                  }); }}
                />
              </div>
            </div>
          </div>
        </main>
      )}
      <CatalogueUploadModal
        flowLabel={upload.uploadFlowLabel}
        isOpen={upload.showUpload}
        mobileOs={upload.uploadMobileOs}
        newFamilyGroup={upload.uploadNewFamilyGroup}
        newFamilyName={upload.uploadNewFamilyName}
        platform={upload.uploadPlatform}
        projectGroups={upload.uploadProjectGroups}
        projectId={upload.uploadProjectId}
        projects={[]}
        referenceLabel={upload.uploadRefLabel}
        referencePreview={upload.uploadRefPreview}
        theme={upload.uploadTheme}
        uploading={upload.uploading}
        webPresetKey={upload.uploadWebPresetKey}
        webPresets={webPresets}
        onClose={upload.resetUploadState}
        onFilesSelected={(files) => void upload.handleFilesSelected(files)}
        onFlowLabelChange={upload.setUploadFlowLabel}
        onMobileOsChange={upload.setUploadMobileOs}
        onNewFamilyGroupChange={upload.setUploadNewFamilyGroup}
        onNewFamilyNameChange={upload.setUploadNewFamilyName}
        onPlatformChange={upload.setUploadPlatform}
        onProjectIdChange={(projectId) => {
          upload.setUploadProjectId(projectId);
          upload.setUploadNewFamilyName('');
          upload.setUploadNewFamilyGroup('');
        }}
        onReferenceLabelChange={upload.setUploadRefLabel}
        onReferenceRemove={() => {
          if (upload.uploadRefPreview) URL.revokeObjectURL(upload.uploadRefPreview);
          upload.setUploadRefFile(null);
          upload.setUploadRefPreview(null);
        }}
        onReferenceSelect={(file) => {
          if (upload.uploadRefPreview) URL.revokeObjectURL(upload.uploadRefPreview);
          if (file && file.type.startsWith('image/')) {
            upload.setUploadRefFile(file);
            upload.setUploadRefPreview(URL.createObjectURL(file));
            return;
          }
          upload.setUploadRefFile(null);
          upload.setUploadRefPreview(null);
        }}
        onThemeChange={upload.setUploadTheme}
        onWebPresetKeyChange={upload.setUploadWebPresetKey}
      />
      <CatalogueSettingsModal
        isOpen={showSettings}
        presetUsage={presetUsage}
        webPresets={webPresets}
        onClose={() => setShowSettings(false)}
        onSave={handleSavePresets}
      />
      {previewFamily && (
        <CatalogueFamilyLightbox
          activeVariantKey={upload.activeVariantKeys[previewFamily.id] ?? null}
          preferredScreenshotId={previewScreenshotHint}
          canEdit={!isGuest}
          canEditMetadata={canEditFamily(previewFamily)}
          canDelete={canDeleteFamily(previewFamily)}
          existingFlows={allFlows}
          existingGroups={allGroups}
          existingUiElements={labelFilterValues.uiElements}
          family={previewFamily}
          flowName={previewFamily.flow_label}
          isAdmin={canAdmin}
          isOpen
          isLoadingNext={pendingPreviewNext}
          onRequireAuth={() => setShowAuthPrompt(true)}
          showLabelTab={activeSection === 'studio'}
          onLabelPersisted={handleLabelPersisted}
          startInlineEdit={previewStartInlineEdit}
          webPresets={webPresets}
          userEmail={user.email || ''}
          onActiveVariantChange={upload.updateActiveVariant}
          onAnnotationStateChange={handleAnnotationStateChange}
          onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
          onClose={() => {
            const lastViewed = previewFamilyId;
            setPreviewFamilyId(null);
            setPreviewScreenshotHint(null);
            setPreviewStartInlineEdit(false);
            setPreviewFamilyOverride(null);
            setPendingPreviewNext(false);
            setRecentlyViewedFamilyId(lastViewed);
          }}
          onPrev={() => stepPreview(-1)}
          onNext={() => stepPreview(1)}
          onCommentCountChange={handleCommentCountChange}
          onCropVariantImage={handleGuestAwareCropFamilyImage}
          onDeleteFamily={handleGuestAwareDeleteFamily}
          onRenameFamily={handleGuestAwareRenameFamily}
          onReplaceVariantImage={handleGuestAwareReplaceImage}
          onSetReference={handleGuestAwareSetReference}
          onSetFlowLabel={handleGuestAwareSetFlowLabel}
          onUpdateVariantDetails={handleGuestAwareUpdateVariantDetails}
          bookmarkedIds={bookmarks.bookmarkedIds}
          onToggleBookmark={(screenshotId) => {
            if (!user.email) {
              setShowAuthPrompt(true);
              return;
            }
            void bookmarks.toggleBookmark(screenshotId).then((result) => {
              if (!result.ok) {
                setToast({ message: 'Could not update bookmark. Try again.', type: 'error' });
              }
            });
          }}
          onShareLink={handleShareSingleScreenshot}
          onToast={(message, type) => setToast({ message, type: type ?? 'info' })}
        />
      )}
      {bulkAction === 'group' && (
        <CatalogueBulkGroupDialog
          allGroups={allGroups}
          primaryGroup={null}
          selectedCount={selected.size}
          value={bulkGroupValue}
          onValueChange={setBulkGroupValue}
          onCancel={() => setBulkAction(null)}
          onConfirm={(value) => void handleBulkChangeGroup(value)}
        />
      )}
      {bulkAction === 'flow' && (
        <CatalogueBulkFlowDialog
          allFlows={allFlows}
          selectedCount={selected.size}
          value={bulkFlowValue}
          onValueChange={setBulkFlowValue}
          onCancel={() => setBulkAction(null)}
          onConfirm={(value) => void handleBulkChangeFlow(value)}
          onRemove={() => void handleBulkClearFlow()}
        />
      )}
      {confirmDeleteOpen && (
        <ConfirmModal
          title={`Move ${selected.size} to Trash`}
          message={`Move ${selected.size} screen famil${selected.size === 1 ? 'y' : 'ies'} to Trash? Recoverable for 15 days from Settings → Team → Trash.`}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            void handleBulkDelete();
          }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {activeSection === 'catalogue' && <CatalogueScrollToTop />}
      {activeSection === 'catalogue' && (
        <CatalogueBulkBar
          filteredFamiliesCount={filteredFamilies.length}
          selectedCount={selected.size}
          selectedVisibleCount={selectedVisibleCount}
          onClearSelection={clearSelection}
          onOpenDeleteConfirm={() => guardAction(() => setConfirmDeleteOpen(true))}
          onOpenGroupDialog={() => guardAction(() => setBulkAction('group'))}
          onOpenFlowDialog={() => guardAction(() => setBulkAction('flow'))}
          onOpenBulkRename={() => guardAction(() => setBulkRenameOpen(true))}
          onSelectAllVisible={selectAllVisible}
        />
      )}
      <CatalogueBulkRenameModal
        isOpen={bulkRenameOpen}
        families={filteredFamilies.filter((family) => selected.has(family.id))}
        onClose={() => setBulkRenameOpen(false)}
        onRenameFamily={handleRenameFamily}
      />
      {dragActive && <CatalogueDropOverlay />}
      {/* Bottom-fixed magnified dock — desktop only. Mobile uses the
          top chip strip rendered above (gated by isMobileViewport). */}
      {CATALOGUE_CHIP_STRIP_ENABLED && !isMobileViewport && activeSection === 'catalogue' && (
        <CatalogueMagnifiedDock
          stats={groupStats}
          appearanceMap={appearanceMap}
          projectId={null}
          activeGroupKey={activeChipGroupKey}
          sortMode={groupSortMode}
          onSelectGroup={handleSelectChipGroup}
          isGroupView={sortBy === 'name-asc'}
        />
      )}
      <CatalogueUploadProgress
        items={upload.uploadProgress}
        onDismiss={upload.dismissUploadProgress}
        onRetryFailed={() => { void upload.retryFailedUploads(); }}
      />
      <CatalogueShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        groups={allGroups}
        screenshots={fullScopeScreenshots}
        initialGroup={filterGroup.length === 1 ? filterGroup[0] : null}
        initialFlow={filterFlow.length === 1 ? filterFlow[0] : null}
        initialPlatform={filterPlatform === 'web' || filterPlatform === 'mobile' ? filterPlatform : null}
        userEmail={user.email ?? null}
      />
      <CatalogueSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        screenshots={fullScopeScreenshots}
        appearanceMap={appearanceMap}
        onSelectGroup={(group) => {
          setFilterGroup([group]);
          setFilterFlow([]);
          setFilterPlatform(null);
        }}
        onSelectFlow={(group, flow) => {
          setFilterGroup([group]);
          setFilterFlow([flow]);
          setFilterPlatform(null);
        }}
        onOpenScreenshot={(screenshot) => {
          // Build a one-variant synthetic family from the screenshot
          // record the search modal hands us — no family-map lookup,
          // no async wait, no "wrong screenshot" fallback. The lightbox
          // renders this directly via the previewFamilyOverride path.
          const synthetic = buildSyntheticFamilyFromScreenshot(screenshot, presetByKey);
          setPreviewStartInlineEdit(false);
          setPreviewScreenshotHint(screenshot.id);
          setPreviewFamilyId(synthetic.id);
          setPreviewFamilyOverride(synthetic);
        }}
        onCommitSearch={({ query, chips }) => {
          // Push the free-text portion AND every accepted entity chip
          // into the catalogue's actual filter pipeline. Chip values
          // map directly to toolbar filter state setters; the rest of
          // the catalogue (grid, chip strip, count badges) reads from
          // the same state, so search-via-chips and search-via-toolbar
          // produce identical visible results.
          setSearchQuery(query);
          // Multi-value filters: OR-style — collect every chip of that
          // kind into the array.
          const groupChips = chips.filter((c) => c.kind === 'group').map((c) => c.value);
          const flowChips = chips.filter((c) => c.kind === 'flow').map((c) => c.value);
          const pageTypeChips = chips.filter((c) => c.kind === 'page_type').map((c) => c.value);
          const uiElementChips = chips.filter((c) => c.kind === 'ui_element').map((c) => c.value);
          const uxPatternChips = chips.filter((c) => c.kind === 'ux_pattern').map((c) => c.value);
          if (groupChips.length > 0) setFilterGroup(groupChips);
          if (flowChips.length > 0) setFilterFlow(flowChips);
          if (pageTypeChips.length > 0) setFilterPageType(pageTypeChips);
          if (uiElementChips.length > 0) setFilterUiElement(uiElementChips);
          if (uxPatternChips.length > 0) setFilterUxPattern(uxPatternChips);
          // Single-value filters: take the LAST chip of that kind
          // (consistent with toolbar dropdown semantics — last wins).
          const platformChip = [...chips].reverse().find((c) => c.kind === 'platform');
          const themeChip = [...chips].reverse().find((c) => c.kind === 'theme');
          const mobileOsChip = [...chips].reverse().find((c) => c.kind === 'mobile_os');
          if (platformChip) setFilterPlatform(platformChip.value as 'web' | 'mobile');
          if (themeChip) setFilterTheme(themeChip.value as 'light' | 'dark');
          if (mobileOsChip) setFilterMobileOs(mobileOsChip.value);
        }}
      />
    </div>
  );
}
