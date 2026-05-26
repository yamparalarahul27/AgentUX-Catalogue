import { CheckSquare, ImageIcon, Square } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueSortOption } from '../lib/catalogue-sort';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import type { ScreenshotNode } from '../types';
import { CatalogueCanvasGalleryView } from './CatalogueCanvasGalleryView';
import { CatalogueFamilyCard } from './CatalogueFamilyCard';
import { CatalogueGalleryView } from './CatalogueGalleryView';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { CatalogueGroupView } from './CatalogueGroupView';
import { CatalogueScrollSentinel } from './CatalogueScrollSentinel';
import { CatalogueSkeletonList } from './CatalogueSkeletonCard';
import { CatalogueStackView } from './CatalogueStackView';

interface CatalogueContentProps {
  activeVariantKeys: Record<string, string>;
  canEdit: boolean;
  filterFlow: string[];
  filterGroup: string[];
  filterMobileOs: string | null;
  filterPlatform: string | null;
  filterTheme: string | null;
  filterWebPreset: string | null;
  gridDensity: GridDensity;
  groupedFamilies: Record<string, CatalogueFamilyView[]>;
  // Full-scope, unpaginated screenshots used exclusively by Group View so it
  // can show every group up front (the paginated `groupedFamilies` would miss
  // groups whose first screenshot lives past the current cursor).
  fullScopeScreenshots: ScreenshotNode[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  searchQuery: string;
  selected: Set<string>;
  sortBy: CatalogueSortOption;
  viewMode: CatalogueViewMode;
  filteredFamilies: CatalogueFamilyView[];
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAnnotationStateChange: (screenshotId: string, activity: { count: number; lastAddedAt: string | null }) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onCommentCountChange: (screenshotId: string, delta: number) => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenPreview: (familyId: string) => void;
  onRequireAuth?: () => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onRemoveReference: (screenshotId: string) => Promise<boolean>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onSetFlowLabel: (familyId: string, flowLabel: string | null) => Promise<boolean>;
  onToggleGroupSelect: (familyIds: string[]) => void;
  onToggleSelect: (familyId: string) => void;
  onUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: 'ios' | 'android' | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
  userEmail: string;
  webPresets: { key: string; label: string; width: number }[];
  bookmarkedIds: Set<string>;
  onToggleBookmark: (screenshotId: string) => void;
  // Card-overlay share — copies a single-screenshot share URL.
  onShareLink: (screenshotId: string) => void;
  // Hide the card delete affordance when the caller lacks permission
  // for this specific family (delete_any, or delete_own + ownership).
  canDeleteFamily: (family: CatalogueFamilyView) => boolean;
  // Gate the click-to-edit on the stack card title (and the gallery
  // view title, which uses the same predicate via canEdit below).
  canEditFamily: (family: CatalogueFamilyView) => boolean;
  // Empty-state escape hatch — clears every filter + search + resets
  // sort so the user lands on the unfiltered "Latest" view.
  onClearFilters: () => void;
  // When true, the Gallery view renders the new Canvas (pannable
  // wallpaper) component instead of the DOM-based CatalogueGalleryView.
  // Toggle lives in the account menu; default on.
  canvasGalleryEnabled?: boolean;
  onExitCanvasGallery?: () => void;
}

export function CatalogueContent({
  activeVariantKeys,
  canEdit,
  filterFlow,
  filterGroup,
  filterMobileOs,
  filterPlatform,
  filterTheme,
  filterWebPreset,
  gridDensity,
  groupedFamilies,
  fullScopeScreenshots,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  searchQuery,
  selected,
  sortBy,
  viewMode,
  filteredFamilies,
  onActiveVariantChange,
  onAnnotationStateChange,
  onChangeFamilyGroup,
  onCommentCountChange,
  onDeleteFamily,
  onOpenPreview,
  onRequireAuth,
  onRenameFamily,
  onRemoveReference,
  onReplaceVariantImage,
  onSetFlowLabel,
  onToggleGroupSelect,
  onToggleSelect,
  onUpdateVariantDetails,
  userEmail,
  webPresets,
  bookmarkedIds,
  onToggleBookmark,
  onShareLink,
  canDeleteFamily,
  canEditFamily,
  onClearFilters,
  canvasGalleryEnabled,
  onExitCanvasGallery,
}: CatalogueContentProps) {
  const hasActiveFilters = Boolean(
    searchQuery ||
    filterFlow.length > 0 ||
    filterGroup.length > 0 ||
    filterPlatform ||
    filterTheme ||
    filterWebPreset ||
    filterMobileOs,
  );

  if (loading) {
    const skeletonVariant = viewMode === 'stack' ? 'stack' : 'grid';
    const skeletonCount = viewMode === 'stack' ? 3 : 8;
    return <CatalogueSkeletonList variant={skeletonVariant} count={skeletonCount} />;
  }

  if (filteredFamilies.length === 0) {
    return (
      <div className="empty-state">
        <ImageIcon size={64} strokeWidth={1.5} />
        <h2>{hasActiveFilters ? 'No matching screen families' : 'No screenshots yet'}</h2>
        <p>{hasActiveFilters ? 'Try adjusting your search or filters, or click below to explore the latest.' : 'Upload screenshots to get started.'}</p>
        {hasActiveFilters && (
          <button type="button" className="empty-state__cta" onClick={onClearFilters}>
            Explore latest
          </button>
        )}
      </div>
    );
  }

  if (viewMode === 'stack') {
    return (
      <>
        <CatalogueStackView
          activeVariantKeys={activeVariantKeys}
          groupedFamilies={groupedFamilies}
          selected={selected}
          onOpenPreview={onOpenPreview}
          onToggleGroupSelect={onToggleGroupSelect}
          onToggleSelect={onToggleSelect}
          onRenameFamily={onRenameFamily}
          canEditFamily={canEditFamily}
        />
        <CatalogueScrollSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
      </>
    );
  }

  if (viewMode === 'gallery') {
    if (canvasGalleryEnabled && onExitCanvasGallery) {
      return (
        <CatalogueCanvasGalleryView
          families={filteredFamilies}
          activeVariantKeys={activeVariantKeys}
          onSelectFamily={onOpenPreview}
          onExit={onExitCanvasGallery}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />
      );
    }
    return (
      <CatalogueGalleryView
        activeVariantKeys={activeVariantKeys}
        canEdit={canEdit}
        families={filteredFamilies}
        onActiveVariantChange={onActiveVariantChange}
        onAnnotationStateChange={onAnnotationStateChange}
        onChangeFamilyGroup={onChangeFamilyGroup}
        onCommentCountChange={onCommentCountChange}
        onDeleteFamily={onDeleteFamily}
        onRequireAuth={onRequireAuth}
        onRenameFamily={onRenameFamily}
        onRemoveReference={onRemoveReference}
        onSetFlowLabel={onSetFlowLabel}
        onUpdateVariantDetails={onUpdateVariantDetails}
        userEmail={userEmail}
        webPresets={webPresets}
      />
    );
  }

  if (sortBy === 'name-asc') {
    return (
      <div className="catalogue-content">
        <CatalogueGroupView
          screenshots={fullScopeScreenshots}
          filterFlow={filterFlow}
          filterPlatform={filterPlatform}
          filterTheme={filterTheme}
          filterMobileOs={filterMobileOs}
          filterWebPreset={filterWebPreset}
          searchQuery={searchQuery}
        />
      </div>
    );
  }

  return (
    <div className="catalogue-content">
      {Object.entries(groupedFamilies).map(([groupName, families]) => {
        const familyIds = families.map((family) => family.id);
        const allSelected = familyIds.every((id) => selected.has(id));

        return (
          <section key={groupName} className="catalogue-section">
            <h3 className="catalogue-section-title">
              <button
                type="button"
                className="catalogue-section-select"
                title={allSelected ? 'Deselect group' : 'Select group'}
                onClick={() => onToggleGroupSelect(familyIds)}
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <CatalogueGroupLabel
                group={groupName}
                projectId={null}
                fallback="Ungrouped"
                iconSize={32}
              />
              <span className="catalogue-section-count">{families.length}</span>
            </h3>

            <div
              className="catalogue-grid catalogue-grid--families"
              {...(gridDensity !== 'auto' ? { 'data-density': gridDensity } : {})}
            >
              {families.map((family) => (
                <CatalogueFamilyCard
                  key={family.id}
                  family={family}
                  activeVariantKey={activeVariantKeys[family.id] ?? null}
                  flowName={family.flow_label}
                  isPrimary={false}
                  isSelected={selected.has(family.id)}
                  isVs={false}
                  onDeleteFamily={onDeleteFamily}
                  onOpenPreview={onOpenPreview}
                  onRenameFamily={onRenameFamily}
                  onReplaceVariantImage={onReplaceVariantImage}
                  onToggleSelect={onToggleSelect}
                  bookmarkedIds={bookmarkedIds}
                  onToggleBookmark={onToggleBookmark}
                  onShareLink={onShareLink}
                  canDelete={canDeleteFamily(family)}
                />
              ))}
            </div>
          </section>
        );
      })}
      <CatalogueScrollSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
    </div>
  );
}
