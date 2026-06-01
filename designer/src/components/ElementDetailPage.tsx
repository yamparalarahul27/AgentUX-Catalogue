import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';

import notFoundIllustration from '../assets/not-found.png';

import {
  buildElementCatalog,
  elementKindLabel,
  findElementEntry,
  type ElementKind,
} from '../lib/element-catalog';
import { useCatalogueFullScope } from '../hooks/use-catalogue-full-scope';
import type { ScreenshotNode } from '../types';
import { CatalogueHeader } from './CatalogueHeader';
import { CatalogueNotFound } from './CatalogueNotFound';
import { ThumbHashImage } from './ThumbHashImage';

interface ElementDetailPageProps {
  user: User;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
}

const KIND_PARAM_TO_KIND: Record<string, ElementKind> = {
  ui: 'ui',
  ux: 'ux',
  page: 'page',
};

export function ElementDetailPage({ user, onLogout, onLogoutEverywhere }: ElementDetailPageProps) {
  const navigate = useNavigate();
  const { kind: kindParam, slug } = useParams<{ kind: string; slug: string }>();
  const { screenshots, loading } = useCatalogueFullScope();

  const kind: ElementKind | null = kindParam && KIND_PARAM_TO_KIND[kindParam] ? KIND_PARAM_TO_KIND[kindParam] : null;

  const catalog = useMemo(() => buildElementCatalog(screenshots), [screenshots]);
  const entry = useMemo(() => {
    if (!kind || !slug) return null;
    return findElementEntry(catalog, kind, slug);
  }, [catalog, kind, slug]);

  // Filter state (group / platform / theme). Local — doesn't sync to URL.
  // The bar is dropdowns; "all" means no filter applied for that axis.
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');

  // Reset filters when the element changes (navigating between elements).
  useEffect(() => {
    setGroupFilter('all');
    setPlatformFilter('all');
    setThemeFilter('all');
  }, [kind, slug]);

  // Available filter options derived from the element's screenshots.
  const availableGroups = useMemo(() => {
    if (!entry) return [];
    const set = new Set<string>();
    for (const shot of entry.screenshots) {
      if (shot.group) set.add(shot.group);
    }
    return [...set].sort();
  }, [entry]);

  const visibleScreenshots = useMemo(() => {
    if (!entry) return [];
    return entry.screenshots.filter((shot) => {
      if (groupFilter !== 'all' && shot.group !== groupFilter) return false;
      if (platformFilter !== 'all' && shot.platform !== platformFilter) return false;
      if (themeFilter !== 'all' && shot.theme !== themeFilter) return false;
      return true;
    });
  }, [entry, groupFilter, platformFilter, themeFilter]);

  // ─────────── Lightweight preview overlay (mirrors GroupDetail) ───────────
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewIndex = useMemo(() => {
    if (!previewId) return -1;
    return visibleScreenshots.findIndex((s) => s.id === previewId);
  }, [previewId, visibleScreenshots]);

  const openPreview = useCallback((shot: ScreenshotNode) => setPreviewId(shot.id), []);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const navigatePreview = useCallback((direction: -1 | 1) => {
    if (previewIndex < 0 || visibleScreenshots.length === 0) return;
    const next = (previewIndex + direction + visibleScreenshots.length) % visibleScreenshots.length;
    setPreviewId(visibleScreenshots[next]?.id ?? null);
  }, [previewIndex, visibleScreenshots]);

  useEffect(() => {
    if (previewId === null) return undefined;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closePreview(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); navigatePreview(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); navigatePreview(1); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [previewId, closePreview, navigatePreview]);

  // Body scroll-lock while preview is open (same pattern as PR #195).
  useEffect(() => {
    if (!previewId) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [previewId]);

  const previewShot = previewIndex >= 0 ? visibleScreenshots[previewIndex] : null;

  // Bad URL — kind isn't ui/ux/page, OR no entry matched. Show 404
  // unless we're still loading the full scope.
  if (!kind) {
    return <CatalogueNotFound user={user} onLogout={onLogout} onLogoutEverywhere={onLogoutEverywhere} />;
  }
  if (!loading && !entry) {
    return <CatalogueNotFound user={user} onLogout={onLogout} onLogoutEverywhere={onLogoutEverywhere} />;
  }

  return (
    <div className="catalogue-page">
      <CatalogueHeader
        activeSection="elements"
        canAdmin={false}
        canLabelingStudio={false}
        onOpenSettings={() => { /* no-op */ }}
        onSectionChange={(section) => {
          if (section === 'elements') {
            navigate('/elements');
            return;
          }
          navigate('/');
        }}
        userEmail={user.email ?? null}
        onSignIn={() => { /* signed in */ }}
        onLogout={onLogout}
        onLogoutEverywhere={onLogoutEverywhere}
        myBookmarksActive={false}
        onToggleMyBookmarks={() => { /* no-op */ }}
        onOpenWhatsNew={() => { /* no-op */ }}
        whatsNewUnseenCount={0}
      />

      <main className="catalogue-main catalogue-element-detail">
        <button
          type="button"
          className="catalogue-element-detail__back"
          onClick={() => navigate('/elements')}
        >
          ← Back to Elements
        </button>

        {entry && (
          <>
            <header className="catalogue-element-detail__head">
              <h1 className="catalogue-element-detail__title">
                {entry.name}
                <span className="catalogue-element-detail__meta-counts">
                  {entry.screenshots.length} {entry.screenshots.length === 1 ? 'screenshot' : 'screenshots'} across {entry.groupCount} {entry.groupCount === 1 ? 'group' : 'groups'}
                </span>
              </h1>
              <p className="catalogue-element-detail__sub">
                <span className={`catalogue-element-detail__kind-tag catalogue-element-detail__kind-tag--${entry.kind}`}>
                  {elementKindLabel(entry.kind)}
                </span>
              </p>
            </header>

            <div className="catalogue-element-detail__toolbar">
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="all">All groups ({availableGroups.length})</option>
                {availableGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
                <option value="all">All platforms</option>
                <option value="web">Web</option>
                <option value="mobile">Mobile</option>
              </select>
              <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
                <option value="all">All themes</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <span className="catalogue-element-detail__count">
                {visibleScreenshots.length} of {entry.screenshots.length}
              </span>
            </div>

            {visibleScreenshots.length === 0 ? (
              <div className="catalogue-element-detail__empty">
                <img src={notFoundIllustration} alt="" className="empty-state__illustration" />
                <p>No screenshots match these filters.</p>
              </div>
            ) : (
              <div className="catalogue-element-detail__grid">
                {visibleScreenshots.map((shot) => (
                  <button
                    type="button"
                    key={shot.id}
                    className="catalogue-element-detail__thumb"
                    onClick={() => openPreview(shot)}
                    aria-label={shot.name || 'Screenshot'}
                  >
                    {shot.image_url ? (
                      <ThumbHashImage src={shot.image_url} thumbHash={shot.thumb_hash ?? null} alt={shot.name || ''} />
                    ) : (
                      <span className="catalogue-element-detail__thumb-empty">
                        <ImageIcon size={20} aria-hidden="true" />
                      </span>
                    )}
                    <span className="catalogue-element-detail__thumb-caption">
                      <span>{shot.name || 'Untitled'}</span>
                      <span className="catalogue-element-detail__thumb-meta">{shot.group ?? '—'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {previewShot && (
        <div
          className="catalogue-element-detail__preview"
          role="dialog"
          aria-modal="true"
          aria-label={previewShot.name || 'Screenshot preview'}
          onClick={closePreview}
        >
          <button
            type="button"
            className="catalogue-element-detail__preview-close"
            onClick={closePreview}
            aria-label="Close preview"
          >
            <X size={20} aria-hidden="true" />
          </button>
          {visibleScreenshots.length > 1 && (
            <>
              <button
                type="button"
                className="catalogue-element-detail__preview-nav is-prev"
                onClick={(event) => { event.stopPropagation(); navigatePreview(-1); }}
                aria-label="Previous screenshot"
              >
                <ChevronLeft size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="catalogue-element-detail__preview-nav is-next"
                onClick={(event) => { event.stopPropagation(); navigatePreview(1); }}
                aria-label="Next screenshot"
              >
                <ChevronRight size={28} aria-hidden="true" />
              </button>
            </>
          )}
          <div className="catalogue-element-detail__preview-frame" onClick={(event) => event.stopPropagation()}>
            {previewShot.image_url && (
              <img src={previewShot.image_url} alt={previewShot.name || ''} draggable={false} />
            )}
            {previewShot.name && (
              <div className="catalogue-element-detail__preview-caption">{previewShot.name}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
