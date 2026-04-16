import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FeatureLogLinkType, FeatureLogStatus, FeatureLogSummary } from '../types';
import { FEATURE_LOG_STATUS_ORDER } from '../lib/feature-log';
import { useFeatureLogFilterState } from '../hooks/use-feature-log-filter-state';
import { useFeatureLog } from '../hooks/use-feature-log';
import type { FeatureLogLinkedScreenshotItem } from '../hooks/use-feature-log-data';
import { useFeatureLogData } from '../hooks/use-feature-log-data';
import { CatalogueScrollSentinel } from './CatalogueScrollSentinel';
import { ConfirmModal } from './ConfirmModal';
import { Dropdown } from './Dropdown';
import { CatalogueFeatureDetail } from './CatalogueFeatureDetail';
import { CatalogueFeatureLinkPicker } from './CatalogueFeatureLinkPicker';

interface CatalogueFeatureLogSectionProps {
  canEdit?: boolean;
  onRequireAuth?: () => void;
  userId: string;
}

const STATUS_LABEL: Record<FeatureLogStatus, string> = {
  planned: 'Planned',
  reference: 'Reference',
  shipped: 'Shipped',
};

const STATUS_HINT: Record<FeatureLogStatus, string> = {
  planned: 'Ideas and upcoming work',
  reference: 'Has reference material',
  shipped: 'Live in production',
};

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Updated recently';
  return `Updated ${new Date(parsed).toLocaleDateString()} ${new Date(parsed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function statusClass(status: FeatureLogStatus): string {
  return `catalogue-feature-log__badge--${status}`;
}

function FeatureLogCard({
  canEdit,
  feature,
  onDelete,
  onEdit,
  onOpen,
}: {
  canEdit: boolean;
  feature: FeatureLogSummary;
  onDelete: (feature: FeatureLogSummary) => void;
  onEdit: (feature: FeatureLogSummary) => void;
  onOpen: (feature: FeatureLogSummary) => void;
}) {
  return (
    <article
      className="catalogue-feature-log__card catalogue-feature-log__card--clickable"
      onClick={() => onOpen(feature)}
    >
      <div className="catalogue-feature-log__card-head">
        <h3 title={feature.title}>{feature.title}</h3>
        <span className={`catalogue-feature-log__badge ${statusClass(feature.status)}`}>
          {STATUS_LABEL[feature.status]}
        </span>
      </div>

      <p className="catalogue-feature-log__card-description">
        {feature.description?.trim() || 'No description yet.'}
      </p>

      <div className="catalogue-feature-log__card-meta">
        <span>{feature.reference_count} reference</span>
        <span>{feature.shipped_count} shipped</span>
        <span>{feature.total_count} total</span>
        <span>{formatTimestamp(feature.updated_at)}</span>
      </div>

      {canEdit && (
        <div className="catalogue-feature-log__card-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onEdit(feature)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onDelete(feature)}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}

export function CatalogueFeatureLogSection({
  canEdit = true,
  onRequireAuth,
  userId,
}: CatalogueFeatureLogSectionProps) {
  const filterState = useFeatureLogFilterState();
  const {
    filters,
    searchQuery,
    setSearchQuery,
    setStatus,
    status,
  } = filterState;

  const {
    createFeature,
    deleteFeature,
    error,
    features,
    groupedFeatures,
    hasMore,
    linkScreenshots,
    loadInitial,
    loadMore,
    loading,
    loadingMore,
    markShipped,
    refreshFeature,
    reopenFeature,
    saving,
    unlinkScreenshot,
    updateFeature,
  } = useFeatureLog({ filters });

  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId],
  );

  const {
    linkedScreenshots,
    linksError,
    loadingLinks,
    loadCandidates,
    refreshLinks,
  } = useFeatureLogData(selectedFeature?.id ?? null);

  const linkedScreenshotIds = useMemo(
    () => linkedScreenshots.map((item) => item.screenshot_id),
    [linkedScreenshots],
  );

  const [deleteCandidate, setDeleteCandidate] = useState<FeatureLogSummary | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFeature, setEditorFeature] = useState<FeatureLogSummary | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorStatus, setEditorStatus] = useState<FeatureLogStatus>('planned');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [markShippedPromptOpen, setMarkShippedPromptOpen] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLinkType, setPickerLinkType] = useState<FeatureLogLinkType>('reference');
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [pickerGroupQuery, setPickerGroupQuery] = useState('');
  const [pickerFlowQuery, setPickerFlowQuery] = useState('');
  const [pickerPlatform, setPickerPlatform] = useState<'all' | 'mobile' | 'web'>('all');
  const [pickerTheme, setPickerTheme] = useState<'all' | 'light' | 'dark'>('all');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerCandidates, setPickerCandidates] = useState<Awaited<ReturnType<typeof loadCandidates>>>([]);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

  const totalReferenceCount = useMemo(
    () => features.reduce((sum, feature) => sum + feature.reference_count, 0),
    [features],
  );
  const totalShippedCount = useMemo(
    () => features.reduce((sum, feature) => sum + feature.shipped_count, 0),
    [features],
  );

  useEffect(() => {
    if (selectedFeatureId && !selectedFeature) {
      setSelectedFeatureId(null);
      setPickerOpen(false);
      setPickerSelectedIds(new Set());
    }
  }, [selectedFeature, selectedFeatureId]);

  function ensureCanEdit(): boolean {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }

  function openCreate() {
    if (!ensureCanEdit()) return;
    setEditorFeature(null);
    setEditorTitle('');
    setEditorDescription('');
    setEditorStatus('planned');
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(feature: FeatureLogSummary) {
    if (!ensureCanEdit()) return;
    setEditorFeature(feature);
    setEditorTitle(feature.title);
    setEditorDescription(feature.description ?? '');
    setEditorStatus(feature.status);
    setEditorError(null);
    setEditorOpen(true);
  }

  async function handleEditorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ensureCanEdit()) return;
    setEditorError(null);

    try {
      if (editorFeature) {
        await updateFeature(editorFeature.id, {
          description: editorDescription,
          status: editorStatus,
          title: editorTitle,
        });
      } else {
        await createFeature({
          description: editorDescription,
          title: editorTitle,
          userId,
        });
      }
      setEditorOpen(false);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save feature.';
      setEditorError(message);
    }
  }

  async function confirmDelete() {
    if (!deleteCandidate || !ensureCanEdit()) return;
    try {
      await deleteFeature(deleteCandidate.id);
      if (selectedFeatureId === deleteCandidate.id) {
        setSelectedFeatureId(null);
      }
      setDeleteCandidate(null);
    } catch {
      // hook exposes error state
    }
  }

  const refreshPickerCandidates = useCallback(async () => {
    if (!pickerOpen) return;

    setPickerLoading(true);
    setPickerError(null);

    try {
      const candidates = await loadCandidates({
        flowQuery: pickerFlowQuery,
        groupQuery: pickerGroupQuery,
        platform: pickerPlatform,
        searchQuery: pickerSearchQuery,
        theme: pickerTheme,
      }, linkedScreenshotIds);

      setPickerCandidates(candidates);
      setPickerSelectedIds((previous) => {
        const allowed = new Set(candidates.filter((candidate) => !candidate.alreadyLinked).map((candidate) => candidate.id));
        const next = new Set<string>();
        for (const id of previous) {
          if (allowed.has(id)) {
            next.add(id);
          }
        }
        return next;
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load screenshots.';
      setPickerCandidates([]);
      setPickerError(message);
    } finally {
      setPickerLoading(false);
    }
  }, [linkedScreenshotIds, loadCandidates, pickerFlowQuery, pickerGroupQuery, pickerOpen, pickerPlatform, pickerSearchQuery, pickerTheme]);

  useEffect(() => {
    if (!pickerOpen) return;
    const timeout = window.setTimeout(() => {
      void refreshPickerCandidates();
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pickerOpen, refreshPickerCandidates]);

  function openDetail(feature: FeatureLogSummary) {
    setSelectedFeatureId(feature.id);
  }

  function closeDetail() {
    setSelectedFeatureId(null);
    setPickerOpen(false);
    setPickerError(null);
    setPickerSelectedIds(new Set());
    setMarkShippedPromptOpen(false);
  }

  function openLinkPicker(linkType: FeatureLogLinkType) {
    if (!selectedFeature || !ensureCanEdit()) return;
    setPickerLinkType(linkType);
    setPickerSelectedIds(new Set());
    setPickerError(null);
    setPickerOpen(true);
  }

  function togglePickerSelect(id: string) {
    setPickerSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function togglePickerSelectAll() {
    const selectableIds = pickerCandidates
      .filter((candidate) => !candidate.alreadyLinked)
      .map((candidate) => candidate.id);

    setPickerSelectedIds((previous) => {
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => previous.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(selectableIds);
    });
  }

  async function handleLinkSelectedScreenshots() {
    if (!selectedFeature || pickerSelectedIds.size === 0 || !ensureCanEdit()) {
      return;
    }

    setPickerError(null);

    try {
      await linkScreenshots(selectedFeature.id, [...pickerSelectedIds], pickerLinkType);
      await Promise.all([
        refreshFeature(selectedFeature.id),
        refreshLinks(),
      ]);
      setPickerSelectedIds(new Set());
      setPickerOpen(false);
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : 'Unable to link screenshots.';
      setPickerError(message);
    }
  }

  async function handleUnlink(item: FeatureLogLinkedScreenshotItem) {
    if (!selectedFeature || !ensureCanEdit()) return;

    try {
      await unlinkScreenshot(selectedFeature.id, item.screenshot_id);
      await Promise.all([
        refreshFeature(selectedFeature.id),
        refreshLinks(),
      ]);
    } catch {
      // hook exposes error state
    }
  }

  async function handleMarkShipped() {
    if (!selectedFeature || !ensureCanEdit()) return;

    const hasShippedLink = linkedScreenshots.some((item) => item.link_type === 'shipped');
    if (!hasShippedLink) {
      setMarkShippedPromptOpen(true);
      return;
    }

    try {
      await markShipped(selectedFeature.id);
      await Promise.all([
        refreshFeature(selectedFeature.id),
        refreshLinks(),
      ]);
    } catch {
      // hook exposes error state
    }
  }

  async function handleReopen() {
    if (!selectedFeature || !ensureCanEdit()) return;

    try {
      await reopenFeature(selectedFeature.id);
      await Promise.all([
        refreshFeature(selectedFeature.id),
        refreshLinks(),
      ]);
    } catch {
      // hook exposes error state
    }
  }

  return (
    <section className="catalogue-feature-log">
      {!selectedFeature && (
        <header className="catalogue-feature-log__head">
          <div className="catalogue-feature-log__copy">
            <h2>Feature Log</h2>
            <p>Global feature lifecycle tracker across all screenshots.</p>
          </div>
          <div className="catalogue-feature-log__head-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadInitial()}
              disabled={loading || saving}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={openCreate}
              disabled={saving}
            >
              + New Feature
            </button>
          </div>
        </header>
      )}

      {!selectedFeature && (
        <div className="catalogue-feature-log__metrics">
          <div className="catalogue-feature-log__metric">
            <span className="catalogue-feature-log__metric-label">Loaded features</span>
            <strong>{features.length}</strong>
          </div>
          <div className="catalogue-feature-log__metric">
            <span className="catalogue-feature-log__metric-label">Reference links</span>
            <strong>{totalReferenceCount}</strong>
          </div>
          <div className="catalogue-feature-log__metric">
            <span className="catalogue-feature-log__metric-label">Shipped links</span>
            <strong>{totalShippedCount}</strong>
          </div>
        </div>
      )}

      {!selectedFeature && (
        <div className="catalogue-feature-log__filters">
          <div className="catalogue-feature-log__search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search feature titles and descriptions..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <Dropdown
            value={status}
            placeholder="All statuses"
            options={[
              { value: 'planned', label: 'Planned' },
              { value: 'reference', label: 'Reference' },
              { value: 'shipped', label: 'Shipped' },
            ]}
            onChange={(value) => setStatus((value ?? 'all') as FeatureLogStatus | 'all')}
            className="catalogue-feature-log__status-dropdown"
          />
        </div>
      )}

      {error && (
        <div className="catalogue-feature-log__error">
          <span>{error}</span>
          {!selectedFeature && (
            <button type="button" className="btn-secondary" onClick={() => void loadInitial()}>
              Retry
            </button>
          )}
        </div>
      )}

      {selectedFeature ? (
        <CatalogueFeatureDetail
          canEdit={canEdit}
          feature={selectedFeature}
          linksError={linksError}
          linkedScreenshots={linkedScreenshots}
          loadingLinks={loadingLinks}
          onBack={closeDetail}
          onEdit={openEdit}
          onMarkShipped={() => { void handleMarkShipped(); }}
          onOpenLinkPicker={openLinkPicker}
          onReopen={() => { void handleReopen(); }}
          onUnlink={(item) => { void handleUnlink(item); }}
          saving={saving}
        />
      ) : loading && features.length === 0 ? (
        <div className="catalogue-feature-log__loading">
          <div className="loading-spinner" />
          <span>Loading feature log…</span>
        </div>
      ) : features.length === 0 ? (
        <div className="catalogue-feature-log__empty">
          <h3>No features found</h3>
          <p>Create your first feature or adjust search filters.</p>
          <button type="button" className="btn-primary" onClick={openCreate}>
            Create feature
          </button>
        </div>
      ) : (
        <div className="catalogue-feature-log__groups">
          {FEATURE_LOG_STATUS_ORDER.map((statusKey) => {
            const items = groupedFeatures[statusKey];
            if (items.length === 0) return null;

            return (
              <section key={statusKey} className="catalogue-feature-log__group">
                <header className="catalogue-feature-log__group-head">
                  <div>
                    <h3>{STATUS_LABEL[statusKey]}</h3>
                    <p>{STATUS_HINT[statusKey]}</p>
                  </div>
                  <span className="catalogue-feature-log__group-count">{items.length}</span>
                </header>
                <div className="catalogue-feature-log__cards">
                  {items.map((feature) => (
                    <FeatureLogCard
                      key={feature.id}
                      canEdit={canEdit}
                      feature={feature}
                      onDelete={setDeleteCandidate}
                      onEdit={openEdit}
                      onOpen={openDetail}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <CatalogueScrollSentinel
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => { void loadMore(); }}
            rootMargin="320px"
          />
        </div>
      )}

      <CatalogueFeatureLinkPicker
        candidates={pickerCandidates}
        error={pickerError}
        flowQuery={pickerFlowQuery}
        groupQuery={pickerGroupQuery}
        isOpen={pickerOpen}
        linkType={pickerLinkType}
        loading={pickerLoading}
        onClose={() => {
          setPickerOpen(false);
          setPickerError(null);
          setPickerSelectedIds(new Set());
        }}
        onConfirm={() => { void handleLinkSelectedScreenshots(); }}
        onFlowQueryChange={setPickerFlowQuery}
        onGroupQueryChange={setPickerGroupQuery}
        onLinkTypeChange={setPickerLinkType}
        onPlatformChange={setPickerPlatform}
        onReload={() => { void refreshPickerCandidates(); }}
        onSearchQueryChange={setPickerSearchQuery}
        onThemeChange={setPickerTheme}
        onToggleSelect={togglePickerSelect}
        onToggleSelectAll={togglePickerSelectAll}
        platform={pickerPlatform}
        saving={saving}
        searchQuery={pickerSearchQuery}
        selectedIds={pickerSelectedIds}
        theme={pickerTheme}
      />

      {editorOpen && (
        <div className="catalogue-feature-log-editor-overlay" onClick={() => setEditorOpen(false)}>
          <div className="catalogue-feature-log-editor" onClick={(event) => event.stopPropagation()}>
            <div className="catalogue-feature-log-editor__head">
              <h3>{editorFeature ? 'Edit Feature' : 'New Feature'}</h3>
              <button type="button" className="catalogue-feature-log-editor__close" onClick={() => setEditorOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form className="catalogue-feature-log-editor__form" onSubmit={handleEditorSubmit}>
              <label>
                <span>Title</span>
                <input
                  type="text"
                  value={editorTitle}
                  onChange={(event) => setEditorTitle(event.target.value)}
                  placeholder="Feature title"
                  required
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  rows={4}
                  value={editorDescription}
                  onChange={(event) => setEditorDescription(event.target.value)}
                  placeholder="Optional description"
                />
              </label>

              {editorFeature && (
                <label>
                  <span>Status</span>
                  <Dropdown
                    value={editorStatus}
                    placeholder="Status"
                    options={[
                      { value: 'planned', label: 'Planned' },
                      { value: 'reference', label: 'Reference' },
                      { value: 'shipped', label: 'Shipped' },
                    ]}
                    onChange={(value) => setEditorStatus((value ?? 'planned') as FeatureLogStatus)}
                  />
                </label>
              )}

              {editorError && <p className="catalogue-feature-log-editor__error">{editorError}</p>}

              <div className="catalogue-feature-log-editor__actions">
                <button type="button" className="btn-secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editorFeature ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <ConfirmModal
          title="Delete Feature"
          message={`Delete "${deleteCandidate.title}"? This removes the feature and links, but keeps screenshots.`}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={() => { void confirmDelete(); }}
        />
      )}

      {markShippedPromptOpen && (
        <ConfirmModal
          title="Add shipped screenshots to complete"
          message="Marking this feature as shipped requires at least one shipped screenshot link."
          confirmLabel="Add shipped screenshots"
          cancelLabel="Not now"
          danger={false}
          onCancel={() => setMarkShippedPromptOpen(false)}
          onConfirm={() => {
            setMarkShippedPromptOpen(false);
            openLinkPicker('shipped');
            setPickerError('Link one or more shipped screenshots, then click Mark Shipped.');
          }}
        />
      )}
    </section>
  );
}
