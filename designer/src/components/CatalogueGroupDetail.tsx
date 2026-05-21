import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, ChevronLeft, ChevronRight, ImageIcon, LayoutGrid, Monitor, Pencil, Share2, Smartphone, X } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import { defaultGridDensity, persistGridDensity, type GridDensity } from '../lib/catalogue-helpers';
import { useCatalogueFullScope } from '../hooks/use-catalogue-full-scope';
import { useCatalogueSettings } from '../hooks/use-catalogue-settings';
import { useGroupAppearanceEditor } from '../hooks/use-group-appearance-editor';
import type { ScreenshotNode } from '../types';
import { CatalogueGridDensity } from './CatalogueGridDensity';
import { CatalogueHeader } from './CatalogueHeader';
import { CatalogueNotFound } from './CatalogueNotFound';
import { CatalogueShareModal } from './CatalogueShareModal';
import { GroupAppearanceEditModal } from './GroupAppearanceEditModal';
import { ThumbHashImage } from './ThumbHashImage';
import { Toast } from './Toast';

type PlatformFilter = 'all' | 'mobile' | 'web';

// Initial visible window; we render this many thumbs upfront and load
// PAGE_SIZE more whenever the user scrolls within reach of the bottom.
const PAGE_SIZE = 50;

// Thumb bucket — drives the per-thumb CSS class on the detail page
// grid. Mobile + narrow-web take 1 column; the wider web breakpoints
// take 2 columns ("--wide"), so they read as a featured tile while
// every cell shares the same height (uniform-height-varied-width
// layout). See `.catalogue-group-detail__grid` in the SCSS.
type ThumbBucket = 'mobile' | 'web-narrow' | 'web-medium' | 'web-wide';

function bucketForScreenshot(
  shot: { platform: 'mobile' | 'web' | null; web_preset_key?: string | null },
  presetWidthByKey: Map<string, number>,
): ThumbBucket {
  if (shot.platform === 'mobile') return 'mobile';
  // Treat null platform as mobile — the v1 catalogue is mobile-heavy
  // and an unlabelled screenshot is more often a phone shot than
  // anything else.
  if (shot.platform !== 'web') return 'mobile';
  const presetWidth = shot.web_preset_key ? presetWidthByKey.get(shot.web_preset_key) : undefined;
  // Web with no/unknown preset → assume the default wide bucket.
  if (presetWidth === undefined) return 'web-wide';
  if (presetWidth <= 480) return 'web-narrow';
  if (presetWidth <= 900) return 'web-medium';
  return 'web-wide';
}

interface CatalogueGroupDetailProps {
  user: User;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
}

function parseTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeGroupKey(value: string): string {
  return value.trim().toLowerCase();
}

function formatTypeMeta(category: string | null, region: string | null): string | null {
  const parts: string[] = [];
  if (category) parts.push(category.toUpperCase());
  if (region) parts.push(region === 'india' ? 'India' : 'Global');
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function CatalogueGroupDetail({ user, onLogout, onLogoutEverywhere }: CatalogueGroupDetailProps) {
  const params = useParams<{ groupKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { screenshots, loading } = useCatalogueFullScope();
  const { webPresets } = useCatalogueSettings(user.id);
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);
  const [showShareModal, setShowShareModal] = useState(false);

  // Lookup map keyed by preset id → width. Used by `bucketForScreenshot`
  // to classify each thumb into one of four buckets (mobile, web-narrow,
  // web-medium, web-wide). Recomputed only when the preset list changes.
  const presetWidthByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const preset of webPresets) {
      map.set(preset.key, preset.width);
    }
    return map;
  }, [webPresets]);
  // Edit modal — rename across casings isn't supported on the detail
  // page in v1 (the rename helper lives inside the main catalogue's
  // family-actions hook). Label changes still save the appearance row;
  // they just don't rebrand the underlying `screenshots.group` field.
  const editor = useGroupAppearanceEditor({ screenshots, onRenameGroupKey: undefined });

  // Grid density — Auto / 2× / 4×. Shared via the same localStorage key
  // as the main catalogue so the user's preference carries between
  // surfaces.
  const [gridDensity, setGridDensity] = useState<GridDensity>(defaultGridDensity);
  useEffect(() => { persistGridDensity(gridDensity); }, [gridDensity]);

  useEffect(() => {
    void ensureCatalogueGroupAppearanceLoaded(null);
    return subscribeCatalogueGroupAppearance(() => {
      setAppearanceMap(readCatalogueGroupAppearanceMap());
    });
  }, []);

  // Resolve the actual group identity. The URL key is a normalized (lowercase)
  // slug; find the matching real group name from the data so we render the
  // catalogue's actual capitalization ("Binance") rather than the slug.
  const urlKey = (params.groupKey ?? '').toLowerCase();
  const groupScreenshots = useMemo(
    () => screenshots.filter((shot) => normalizeGroupKey(shot.group ?? '') === urlKey),
    [screenshots, urlKey],
  );

  const groupName = useMemo(() => {
    const sample = groupScreenshots.find((s) => s.group);
    return sample?.group ?? urlKey;
  }, [groupScreenshots, urlKey]);

  const appearance = useMemo(
    () => resolveCatalogueGroupAppearance(appearanceMap, groupName, null),
    [appearanceMap, groupName],
  );
  const label = appearance.label || groupName;
  const typeMeta = formatTypeMeta(appearance.category, appearance.region);

  const hasMobile = useMemo(() => groupScreenshots.some((s) => s.platform === 'mobile'), [groupScreenshots]);
  const hasWeb = useMemo(() => groupScreenshots.some((s) => s.platform === 'web'), [groupScreenshots]);

  // Tabs act as platform filters on top of a unified grid. Default 'all'
  // shows every screenshot in the group. Mobile / Web tabs narrow it.
  const [activeTab, setActiveTab] = useState<PlatformFilter>('all');

  const filteredScreenshots = useMemo(() => {
    const list = activeTab === 'all'
      ? groupScreenshots
      : groupScreenshots.filter((s) => s.platform === activeTab);
    return [...list].sort((a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at));
  }, [groupScreenshots, activeTab]);

  const totalScreenshotCount = groupScreenshots.length;

  // Pagination — window of `visibleCount` rendered upfront, more loaded
  // by IntersectionObserver as the user scrolls. Reset to PAGE_SIZE
  // whenever the filtered set changes (different tab / new data).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, filteredScreenshots.length]);

  const visibleScreenshots = useMemo(
    () => filteredScreenshots.slice(0, visibleCount),
    [filteredScreenshots, visibleCount],
  );
  const hasMore = visibleCount < filteredScreenshots.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const node = sentinelRef.current;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredScreenshots.length));
      }
    }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filteredScreenshots.length]);

  // Deep-link: ?shot=<id> auto-opens the lightweight preview overlay.
  // Preview navigation cycles through the filtered (i.e. currently-
  // visible-on-tab) set, so changing tabs while a preview is open
  // re-scopes the prev/next cycle accordingly.
  const previewId = searchParams.get('shot');
  const previewIndex = useMemo(() => {
    if (!previewId) return -1;
    return filteredScreenshots.findIndex((s) => s.id === previewId);
  }, [previewId, filteredScreenshots]);

  // If a deep-linked screenshot exists in the group but isn't in the
  // currently filtered set (e.g. user landed on /g/x?shot=Y while
  // already filtered to a different platform), drop back to "All" so
  // the preview surfaces.
  useEffect(() => {
    if (!previewId) return;
    const inFiltered = filteredScreenshots.some((s) => s.id === previewId);
    if (inFiltered) return;
    const existsInGroup = groupScreenshots.some((s) => s.id === previewId);
    if (existsInGroup && activeTab !== 'all') setActiveTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId, filteredScreenshots, groupScreenshots]);

  const openPreview = useCallback((shot: ScreenshotNode) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('shot', shot.id);
      return next;
    });
  }, [setSearchParams]);

  const closePreview = useCallback(() => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('shot');
      return next;
    });
  }, [setSearchParams]);

  const navigatePreview = useCallback((direction: -1 | 1) => {
    if (previewIndex < 0) return;
    const nextIndex = (previewIndex + direction + filteredScreenshots.length) % filteredScreenshots.length;
    const nextShot = filteredScreenshots[nextIndex];
    if (nextShot) openPreview(nextShot);
  }, [previewIndex, filteredScreenshots, openPreview]);

  // Esc + arrow keys while preview is open.
  useEffect(() => {
    if (previewIndex < 0) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closePreview();
      else if (event.key === 'ArrowLeft') navigatePreview(-1);
      else if (event.key === 'ArrowRight') navigatePreview(1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewIndex, closePreview, navigatePreview]);

  function handleShare() {
    setShowShareModal(true);
  }

  function handleBack() {
    navigate('/');
  }

  // Group list for the Share modal — derived from the full-scope set so
  // the dropdown can render every group the user has access to (not just
  // the one we're on).
  const allGroupsForShare = useMemo(() => {
    const set = new Set<string>();
    for (const shot of screenshots) {
      if (shot.group) set.add(shot.group);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [screenshots]);

  const previewShot = previewIndex >= 0 ? filteredScreenshots[previewIndex] : null;

  // Soft-404: /g/<key> where <key> doesn't match any group in the
  // (loaded) full-scope set. We wait until the cache has resolved
  // (loading=false) and there's at least *some* catalogue data
  // (screenshots.length > 0) before declaring the group missing.
  // Without that guard, an in-flight fetch would briefly flash the
  // NotFound page on first paint.
  const groupMissing = !loading && screenshots.length > 0 && groupScreenshots.length === 0;
  if (groupMissing) {
    return (
      <CatalogueNotFound
        user={user}
        onLogout={onLogout}
        onLogoutEverywhere={onLogoutEverywhere}
      />
    );
  }

  return (
    <div className="catalogue-page">
      <CatalogueHeader
        activeSection="catalogue"
        canAdmin={false}
        canLabelingStudio={false}
        onOpenSettings={() => { /* no-op on detail page */ }}
        onSectionChange={(section) => {
          // Sections only mean anything in the main catalogue — go back home,
          // the section state will reset to its default there.
          if (section === 'catalogue') navigate('/');
          else navigate('/');
        }}
        userEmail={user.email ?? null}
        onSignIn={() => { /* signed in already on this route */ }}
        onLogout={onLogout}
        onLogoutEverywhere={onLogoutEverywhere}
        myBookmarksActive={false}
        onToggleMyBookmarks={() => { /* no-op on detail page */ }}
        onOpenWhatsNew={() => { /* no-op on detail page — host the panel on the main catalogue */ }}
        whatsNewUnseenCount={0}
      />

      <main className="catalogue-main catalogue-group-detail">
        <button
          type="button"
          className="catalogue-group-detail__back"
          onClick={handleBack}
          aria-label="Back to catalogue"
          title="Back to catalogue"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>

        <header className="catalogue-group-detail__header">
          <div className="catalogue-group-detail__icon">
            {appearance.iconUrl ? (
              <img src={appearance.iconUrl} alt="" aria-hidden="true" />
            ) : (
              <LayoutGrid size={40} aria-hidden="true" />
            )}
          </div>

          <div className="catalogue-group-detail__heading">
            <div className="catalogue-group-detail__title-row">
              <h1 className="catalogue-group-detail__name">{label}</h1>
              <div className="catalogue-group-detail__actions">
                <button
                  type="button"
                  className="catalogue-group-detail__action-btn"
                  onClick={() => editor.beginEdit(groupName)}
                  disabled={!groupName || loading}
                >
                  <Pencil size={14} aria-hidden="true" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="catalogue-group-detail__action-btn"
                  onClick={handleShare}
                >
                  <Share2 size={14} aria-hidden="true" />
                  <span>Share</span>
                </button>
              </div>
            </div>

            <div className="catalogue-group-detail__meta">
              <div className="catalogue-group-detail__meta-col">
                <span className="catalogue-group-detail__meta-label">Platform</span>
                <span className="catalogue-group-detail__meta-value">
                  {hasWeb && hasMobile ? 'Web · Mobile' : hasWeb ? 'Web' : hasMobile ? 'Mobile' : '—'}
                </span>
              </div>
              <div className="catalogue-group-detail__meta-col">
                <span className="catalogue-group-detail__meta-label">Screens</span>
                <span className="catalogue-group-detail__meta-value">{totalScreenshotCount}</span>
              </div>
              {typeMeta && (
                <div className="catalogue-group-detail__meta-col">
                  <span className="catalogue-group-detail__meta-label">Type</span>
                  <span className="catalogue-group-detail__meta-value">{typeMeta}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="catalogue-group-detail__divider" />

        {(hasMobile || hasWeb) && (
          <div className="catalogue-group-detail__subnav">
            <div className="catalogue-group-detail__tabs" role="tablist" aria-label="Platform filter">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                className={`catalogue-group-detail__tab${activeTab === 'all' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('all')}
                aria-label="All platforms"
              >
                <LayoutGrid size={16} aria-hidden="true" />
              </button>
              {hasMobile && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'mobile'}
                  className={`catalogue-group-detail__tab${activeTab === 'mobile' ? ' is-active' : ''}`}
                  onClick={() => setActiveTab('mobile')}
                  aria-label="Mobile only"
                >
                  <Smartphone size={16} aria-hidden="true" />
                </button>
              )}
              {hasWeb && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'web'}
                  className={`catalogue-group-detail__tab${activeTab === 'web' ? ' is-active' : ''}`}
                  onClick={() => setActiveTab('web')}
                  aria-label="Web only"
                >
                  <Monitor size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="catalogue-group-detail__subnav-count">
              {filteredScreenshots.length} {filteredScreenshots.length === 1 ? 'screen' : 'screens'}
            </span>
            <div className="catalogue-group-detail__subnav-spacer" />
            <CatalogueGridDensity value={gridDensity} onChange={setGridDensity} />
          </div>
        )}

        {loading && filteredScreenshots.length === 0 ? (
          <div className="catalogue-group-detail__empty">Loading screenshots…</div>
        ) : visibleScreenshots.length > 0 ? (
          <>
            <div
              className="catalogue-group-detail__grid"
              {...(gridDensity !== 'auto' ? { 'data-density': gridDensity } : {})}
            >
              {visibleScreenshots.map((shot) => {
                const bucket = bucketForScreenshot(shot, presetWidthByKey);
                return (
                <button
                  type="button"
                  key={shot.id}
                  className={`catalogue-group-detail__thumb catalogue-group-detail__thumb--${bucket}`}
                  onClick={() => openPreview(shot)}
                  aria-label={shot.name || 'Screenshot'}
                >
                  {shot.image_url ? (
                    <ThumbHashImage
                      src={shot.image_url}
                      thumbHash={shot.thumb_hash ?? null}
                      alt={shot.name || ''}
                    />
                  ) : (
                    <span className="catalogue-group-detail__thumb-empty">
                      <ImageIcon size={20} aria-hidden="true" />
                    </span>
                  )}
                </button>
                );
              })}
            </div>
            {hasMore && (
              <div ref={sentinelRef} className="catalogue-group-detail__sentinel">
                Loading more…
              </div>
            )}
          </>
        ) : (
          <div className="catalogue-group-detail__empty">
            {activeTab === 'all'
              ? 'No screenshots in this group yet.'
              : `No ${activeTab === 'mobile' ? 'mobile' : 'web'} screenshots in this group.`}
          </div>
        )}

      </main>

      <CatalogueShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        groups={allGroupsForShare}
        screenshots={screenshots}
        initialGroup={groupName || null}
        initialFlow={null}
        initialPlatform={null}
        userEmail={user.email ?? null}
        lockGroup
      />

      {previewShot && (
        <div
          className="catalogue-group-detail__preview"
          role="dialog"
          aria-modal="true"
          aria-label={previewShot.name || 'Screenshot preview'}
          onClick={closePreview}
        >
          <button
            type="button"
            className="catalogue-group-detail__preview-close"
            onClick={closePreview}
            aria-label="Close preview"
          >
            <X size={20} aria-hidden="true" />
          </button>
          {filteredScreenshots.length > 1 && (
            <>
              <button
                type="button"
                className="catalogue-group-detail__preview-nav is-prev"
                onClick={(event) => { event.stopPropagation(); navigatePreview(-1); }}
                aria-label="Previous screenshot"
              >
                <ChevronLeft size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="catalogue-group-detail__preview-nav is-next"
                onClick={(event) => { event.stopPropagation(); navigatePreview(1); }}
                aria-label="Next screenshot"
              >
                <ChevronRight size={28} aria-hidden="true" />
              </button>
            </>
          )}
          <div className="catalogue-group-detail__preview-frame" onClick={(event) => event.stopPropagation()}>
            {previewShot.image_url && (
              <img
                src={previewShot.image_url}
                alt={previewShot.name || ''}
                draggable={false}
              />
            )}
            {previewShot.name && (
              <div className="catalogue-group-detail__preview-caption">{previewShot.name}</div>
            )}
          </div>
        </div>
      )}

      {editor.editingGroupKey && (
        <GroupAppearanceEditModal
          group={editor.editingGroupOriginal}
          labelDraft={editor.labelDraft}
          iconUrlDraft={editor.iconUrlDraft}
          categoryDraft={editor.categoryDraft}
          regionDraft={editor.regionDraft}
          hasUploadedIcon={editor.hasUploadedIcon}
          isUploading={editor.isUploading}
          isSaving={editor.isSaving}
          message={editor.saveMessage}
          onChangeLabel={editor.setLabelDraft}
          onChangeCategory={editor.setCategoryDraft}
          onChangeRegion={editor.setRegionDraft}
          onPickFile={(file) => { void editor.handleIconUpload(file); }}
          onRemoveUploadedIcon={() => { void editor.handleRemoveIcon(); }}
          onSave={() => { void editor.save(); }}
          onCancel={editor.cancelEdit}
        />
      )}

      {editor.saveMessage && !editor.editingGroupKey && (
        <Toast
          message={editor.saveMessage}
          type="success"
          onClose={() => editor.setSaveMessage(null)}
          duration={3000}
        />
      )}
    </div>
  );
}
