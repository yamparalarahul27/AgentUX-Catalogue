import { CheckSquare, ImageIcon, Square } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import type { GridDensity } from '../lib/catalogue-helpers';
import type { CatalogueViewMode } from '../lib/catalogue-view';
import { CatalogueFamilyCard } from './CatalogueFamilyCard';
import { CatalogueGalleryView } from './CatalogueGalleryView';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
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
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  searchQuery: string;
  selected: Set<string>;
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
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  searchQuery,
  selected,
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
        <ImageIcon size={64} color="#3f3f46" strokeWidth={1.5} />
        <h2>{hasActiveFilters ? 'No matching screen families' : 'No screenshots yet'}</h2>
        <p>{hasActiveFilters ? 'Try adjusting your search or filters.' : 'Upload screenshots to get started.'}</p>
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
        />
        <CatalogueScrollSentinel hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
      </>
    );
  }

  if (viewMode === 'gallery') {
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
        onReplaceVariantImage={onReplaceVariantImage}
        onSetFlowLabel={onSetFlowLabel}
        onUpdateVariantDetails={onUpdateVariantDetails}
        userEmail={userEmail}
        webPresets={webPresets}
      />
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
                projectId={families[0]?.project_id ?? null}
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
