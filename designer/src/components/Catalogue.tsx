import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { WebPreset } from '../types';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useIsAdmin } from '../lib/auth-passcode';
import { useCapability, useMyRole } from '../hooks/use-role-capabilities';
import { MARKETING_BUCKET_GROUP } from '../lib/marketing-bucket';
import { useCatalogueData } from '../hooks/use-catalogue-data';
import { useCatalogueFamilyActions } from '../hooks/use-catalogue-family-actions';
import { useCatalogueFilterState } from '../hooks/use-catalogue-filter-state';
import { useCatalogueFilters } from '../hooks/use-catalogue-filters';
import { useCatalogueFullScope } from '../hooks/use-catalogue-full-scope';
import { useCatalogueGuestGuards } from '../hooks/use-catalogue-guest-guards';
import { useCatalogueSettings } from '../hooks/use-catalogue-settings';
import { useCatalogueUpload } from '../hooks/use-catalogue-upload';
import { usePasteToUpload } from '../hooks/use-paste-to-upload';
import { useDropToUpload } from '../hooks/use-drop-to-upload';
import { useCatalogueSearchShortcut } from '../hooks/use-catalogue-search-shortcut';
import { buildCatalogueFamilies, CATALOGUE_FLOW_LABEL_KEY } from '../lib/catalogue-families';
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
} from '../lib/feature-flags';
import { buildPresetUsage, defaultGridDensity, defaultViewMode, persistGridDensity, persistViewMode } from '../lib/catalogue-helpers';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueBulkBar } from './CatalogueBulkBar';
import { CatalogueBulkFlowDialog } from './CatalogueBulkFlowDialog';
import { CatalogueBulkGroupDialog } from './CatalogueBulkGroupDialog';
import { CatalogueBulkRenameModal } from './CatalogueBulkRenameModal';
import { CatalogueContent } from './CatalogueContent';
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
import { CatalogueToolbar } from './CatalogueToolbar';
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
    projects,
    screenFamilies,
    screenshots,
    setProjects,
    setScreenFamilies,
    setScreenshots,
  } = useCatalogueData({
    activeProjectId: null,
    filters,
    sortBy,
    searchQuery: searchQueryDebounced,
  });

  const { saveWebPresets, presetByKey, webPresets } = useCatalogueSettings(user.id);
  const primaryGroup = projects[0]?.primary_group ?? null;
  // Data is pre-scoped + pre-filtered by useCatalogueData
  const scopedScreenshots = screenshots;
  const scopedScreenFamilies = screenFamilies;
  const {
    annotatedScreenshotIds,
    annotationLabels,
    commentedScreenshotIds,
    screenshots: fullScopeScreenshots,
    setScreenshots: setFullScopeScreenshots,
  } = useCatalogueFullScope({
    projects,
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
  const appearanceProjectId = projects[0]?.id ?? null;

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
    void ensureCatalogueGroupAppearanceLoaded(appearanceProjectId);
  }, [appearanceProjectId]);

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
      (key) => resolveCatalogueGroupAppearance(appearanceMap, key, appearanceProjectId).label || key,
    );
    return ordered.map((item) => item.groupKey);
  }, [appearanceMap, appearanceProjectId, groupSortMode, groupStats]);

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

  // When the URL provides a single ?group=X but the project actually has
  // multiple casings under that canonical key, expand filterGroup to all
  // rawKeys once stats arrive. Avoids only fetching one casing when the
  // user shared a link or reloaded.
  useEffect(() => {
    if (!CATALOGUE_CHIP_STRIP_ENABLED) return;
    if (filterGroup.length !== 1) return;
    const canonical = filterGroup[0].toLowerCase();
    const stat = groupStats.find((item) => item.groupKey === canonical);
    if (!stat || stat.rawKeys.length <= 1) return;
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
  const [previewFamilyId, setPreviewFamilyId] = useState<string | null>(null);
  const [previewStartInlineEdit, setPreviewStartInlineEdit] = useState(false);
  const [pendingPreviewNext, setPendingPreviewNext] = useState(false);
  const [recentlyViewedFamilyId, setRecentlyViewedFamilyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'group' | 'flow' | null>(null);
  const [bulkFlowValue, setBulkFlowValue] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [viewMode, setViewMode] = useState<CatalogueViewMode>(defaultViewMode);
  const [gridDensity, setGridDensity] = useState<GridDensity>(defaultGridDensity);
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
  const allFamilies = useMemo(
    () => buildCatalogueFamilies(scopedScreenshots, scopedScreenFamilies, presetByKey),
    [presetByKey, scopedScreenFamilies, scopedScreenshots],
  );
  const familyById = useMemo(
    () => Object.fromEntries(allFamilies.map((family) => [family.id, family])),
    [allFamilies],
  );
  const screenshotIdToFamilyId = useMemo(() => {
    const map = new Map<string, string>();
    for (const family of allFamilies) {
      for (const variant of family.variants) {
        map.set(variant.id, family.id);
      }
    }
    return map;
  }, [allFamilies]);
  const [studioLabelOverrides, setStudioLabelOverrides] = useState<Map<string, ScreenshotLabel>>(new Map());
  const studioProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const studioTotals = useLabelingStudioTotals(studioProjectIds);
  const handleStudioLabelPersisted = useCallback((screenshotId: string, label: ScreenshotLabel) => {
    setStudioLabelOverrides((previous) => {
      const next = new Map(previous);
      next.set(screenshotId, label);
      return next;
    });
    studioTotals.refetch();
  }, [studioTotals]);
  const handleStudioCardClick = useCallback((screenshotId: string) => {
    const familyId = screenshotIdToFamilyId.get(screenshotId);
    if (familyId) {
      setPreviewFamilyId(familyId);
    }
  }, [screenshotIdToFamilyId]);
  const presetUsage = useMemo(() => buildPresetUsage(scopedScreenshots), [scopedScreenshots]);
  const selectedVisibleCount = useMemo(
    () => filteredFamilies.filter((family) => selected.has(family.id)).length,
    [filteredFamilies, selected],
  );
  const previewFamily = previewFamilyId ? familyById[previewFamilyId] ?? null : null;
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
    filterProject: projects[0]?.id ?? null,
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
    projects,
    screenFamilies: scopedScreenFamilies,
    screenshots: scopedScreenshots,
    setFullScopeScreenshots,
    setProjects,
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
    projects,
    setScreenshots,
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

  useEffect(() => {
    if (previewFamilyId && !familyById[previewFamilyId]) {
      setPreviewFamilyId(null);
    }
  }, [familyById, previewFamilyId]);
  useEffect(() => {
    if (!canAdmin && (activeSection === 'team' || activeSection === 'studio')) {
      setActiveSection('catalogue');
    }
  }, [activeSection, canAdmin]);

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

  // Cmd+K (or Ctrl+K) / Option+Space / `/` opens the categorised search
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
  function openPreview(familyId: string) {
    setPreviewStartInlineEdit(false);
    setPreviewFamilyId(familyId);
  }

  function stepPreview(direction: -1 | 1) {
    if (!previewFamilyId || filteredFamilies.length === 0) return;
    const currentIndex = filteredFamilies.findIndex((family) => family.id === previewFamilyId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < filteredFamilies.length) {
      setPreviewStartInlineEdit(false);
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
  async function handleBulkDelete() {
    if (!requireEditAccess() || selected.size === 0) return;
    for (const id of selected) await handleDeleteFamily(id);
    clearSelection();
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
    <div className={`catalogue-page ${canAdmin ? 'catalogue-page--team-enabled' : ''}`}>
      <CatalogueHeader
        activeSection={activeSection}
        canAdmin={canAdmin}
        canLabelingStudio={canLabelingStudio}
        onOpenSettings={() => setShowSettings(true)}
        onSectionChange={setActiveSection}
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
      />
      {activeSection === 'team' && canAdmin ? (
        <main className="catalogue-main">
          <div className="catalogue-shell catalogue-shell--team">
            <CatalogueTeamSection
              projects={projects}
              screenshots={fullScopeScreenshots}
              currentUserEmail={user.email ?? ''}
              onRenameGroupKey={handleRenameGroupKey}
              onTrashRestored={loadData}
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
              screenshots={screenshots}
              hasMore={hasMore}
              loadMore={loadMore}
              loadingMore={loadingMore}
              overrides={studioLabelOverrides}
              selectedScreenshotId={previewFamilyId}
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
              {CATALOGUE_CHIP_STRIP_ENABLED && (
                <CatalogueGroupChipStrip
                  stats={groupStats}
                  appearanceMap={appearanceMap}
                  projectId={appearanceProjectId}
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
                    if (inserted.length > 0) setSelected(new Set(inserted.map((item) => item.id)));
                  });
                }}
                onSortByChange={setSortBy}
                onViewByChange={setViewBy}
                onViewModeChange={setViewMode}
                searchQuery={searchQuery}
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
              />

              <div className="catalogue-body-layout">
                <div className="catalogue-body-main">
                  <CatalogueContent
                    activeVariantKeys={upload.activeVariantKeys}
                    canEdit={!isGuest}
                    filterFlow={filterFlow}
                    filterGroup={filterGroup}
                    filterMobileOs={filterMobileOs}
                    filterPlatform={filterPlatform}
                    filterTheme={filterTheme}
                    filterWebPreset={filterWebPreset}
                    filteredFamilies={filteredFamilies}
                    gridDensity={gridDensity}
                    groupedFamilies={groupedFamilies}
                    hasMore={hasMore}
                    loading={loading}
                    loadingMore={loadingMore}
                    onLoadMore={loadMore}
                    searchQuery={searchQuery}
                    selected={selected}
                    viewMode={viewMode}
                    onActiveVariantChange={upload.updateActiveVariant}
                    onAnnotationStateChange={handleAnnotationStateChange}
                    onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
                    onCommentCountChange={handleCommentCountChange}
                    onDeleteFamily={handleGuestAwareDeleteFamily}
                    canDeleteFamily={canDeleteFamily}
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
                  />
                </div>
                <CatalogueQuickUploadModal
                  existingFlows={allFlows}
                  flowLabel={upload.quickUploadFlowLabel}
                  isOpen={upload.showQuickUpload}
                  projectId={upload.quickUploadProjectId}
                  projects={projects.map((project) => ({ id: project.id, name: project.name }))}
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
                  onQuickUploadUploadAll={() => { void upload.handleQuickUploadUploadAll().then((inserted) => inserted.length > 0 && setSelected(new Set(inserted.map((item) => item.id)))); }}
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
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
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
          canEdit={!isGuest}
          canEditMetadata={canEditFamily(previewFamily)}
          canDelete={canDeleteFamily(previewFamily)}
          existingAnnotationLabels={annotationLabels}
          existingFlows={allFlows}
          existingGroups={allGroups}
          family={previewFamily}
          flowName={previewFamily.flow_label}
          isAdmin={canAdmin}
          isOpen
          isLoadingNext={pendingPreviewNext}
          onRequireAuth={() => setShowAuthPrompt(true)}
          showLabelTab={activeSection === 'studio'}
          onLabelPersisted={activeSection === 'studio' ? handleStudioLabelPersisted : undefined}
          startInlineEdit={previewStartInlineEdit}
          webPresets={webPresets}
          userEmail={user.email || ''}
          onActiveVariantChange={upload.updateActiveVariant}
          onAnnotationStateChange={handleAnnotationStateChange}
          onChangeFamilyGroup={handleGuestAwareChangeFamilyGroup}
          onClose={() => {
            const lastViewed = previewFamilyId;
            setPreviewFamilyId(null);
            setPreviewStartInlineEdit(false);
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
        />
      )}
      {bulkAction === 'group' && (
        <CatalogueBulkGroupDialog
          allGroups={allGroups}
          primaryGroup={primaryGroup}
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
        appearanceProjectId={appearanceProjectId}
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
        onSelectScreenshot={(screenshot) => {
          setFilterGroup(screenshot.group ? [screenshot.group] : []);
          const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
          const flowLabel = metadata && typeof metadata === 'object' && typeof metadata[CATALOGUE_FLOW_LABEL_KEY] === 'string'
            ? (metadata[CATALOGUE_FLOW_LABEL_KEY] as string)
            : null;
          setFilterFlow(flowLabel ? [flowLabel] : []);
          setFilterPlatform(screenshot.platform === 'mobile' || screenshot.platform === 'web' ? screenshot.platform : null);
          setSearchQuery(screenshot.name);
        }}
      />
    </div>
  );
}
