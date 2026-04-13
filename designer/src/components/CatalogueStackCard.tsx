import { useEffect, useMemo, useState } from 'react';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { formatDateTime, parseAnnotations, type LightboxAnnotation } from '../lib/catalogue-lightbox';
import { supabase } from '../lib/supabase';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';

type ScreenshotComment = {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_email?: string | null;
};

interface CatalogueStackCardProps {
  family: CatalogueFamilyView;
  activeVariantKey: string | null;
  isSelected: boolean;
  onOpenPreview: (familyId: string) => void;
  onToggleSelect: (familyId: string) => void;
}

export function CatalogueStackCard({
  family,
  activeVariantKey,
  isSelected,
  onOpenPreview,
  onToggleSelect,
}: CatalogueStackCardProps) {
  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey),
    [family, activeVariantKey],
  );
  const screenshot = activeVariant?.screenshot ?? null;

  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState('');

  const annotations = useMemo<LightboxAnnotation[]>(
    () => (screenshot ? parseAnnotations(screenshot.metadata) : []),
    [screenshot],
  );

  useEffect(() => {
    if (!screenshot) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setLoadingComments(true);
    setCommentsError('');
    supabase
      .from('screenshot_comments')
      .select('*')
      .eq('screenshot_id', screenshot.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingComments(false);
        if (error || !data) {
          setCommentsError('Unable to load comments.');
          setComments([]);
          return;
        }
        setComments(data as ScreenshotComment[]);
      });
    return () => {
      cancelled = true;
    };
  }, [screenshot]);

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => {
      const aResolved = Boolean(a.resolved_at);
      const bResolved = Boolean(b.resolved_at);
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }),
    [comments],
  );

  if (!screenshot) return null;

  return (
    <article className={`catalogue-stack__card ${isSelected ? 'is-selected' : ''}`}>
      <div className="catalogue-stack__media">
        <button
          type="button"
          className={`catalogue-stack__select ${isSelected ? 'is-selected' : ''}`}
          onClick={() => onToggleSelect(family.id)}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-label={isSelected ? 'Deselect' : 'Select'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isSelected ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
                <polyline points="9 11 12 14 20 6" stroke="#0f0f10" strokeWidth="3" />
              </>
            ) : (
              <rect x="3" y="3" width="18" height="18" rx="2" />
            )}
          </svg>
        </button>
        <button
          type="button"
          className="catalogue-stack__image"
          onClick={() => onOpenPreview(family.id)}
          title="Open preview"
        >
          {screenshot.image_url ? (
            <img src={screenshot.image_url} alt={family.name} />
          ) : (
            <span className="catalogue-stack__image-placeholder">No image</span>
          )}
          {annotations.map((annotation, index) => (
            <span
              key={annotation.id}
              className="catalogue-stack__pin"
              style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
            >
              {index + 1}
            </span>
          ))}
        </button>
      </div>

      <div className="catalogue-stack__panel">
        <div className="catalogue-stack__panel-header">
          <div className="catalogue-stack__title-row">
            <h3 className="catalogue-stack__title" title={family.name}>{family.name}</h3>
          </div>
          <div className="catalogue-stack__meta-row">
            {family.group && (
              <span className="catalogue-stack__chip">
                <CatalogueGroupLabel group={family.group} projectId={family.project_id} />
              </span>
            )}
            {family.flow_label && (
              <span className="catalogue-stack__chip catalogue-stack__chip--flow">
                {family.flow_label}
              </span>
            )}
            {activeVariant && (
              <span className="catalogue-stack__chip catalogue-stack__chip--variant">
                {activeVariant.label}
              </span>
            )}
          </div>
          <div className="catalogue-stack__counters">
            <span className="catalogue-stack__counter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </span>
            <span className="catalogue-stack__counter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {annotations.length} {annotations.length === 1 ? 'pin' : 'pins'}
            </span>
          </div>
        </div>

        <div className="catalogue-stack__thread">
          {loadingComments ? (
            <p className="catalogue-stack__thread-empty">Loading comments…</p>
          ) : commentsError ? (
            <p className="catalogue-stack__thread-error">{commentsError}</p>
          ) : sortedComments.length === 0 ? (
            <p className="catalogue-stack__thread-empty">No comments yet.</p>
          ) : (
            sortedComments.map((comment) => (
              <div
                key={comment.id}
                className={`catalogue-stack__comment ${comment.resolved_at ? 'is-resolved' : ''}`}
              >
                <div className="catalogue-stack__comment-top">
                  <span className="catalogue-stack__comment-email">{comment.user_email}</span>
                  <span className="catalogue-stack__comment-time">{formatDateTime(comment.created_at)}</span>
                </div>
                <p className="catalogue-stack__comment-text">{comment.text}</p>
                {comment.resolved_at && (
                  <span className="catalogue-stack__comment-resolved">
                    Resolved by {comment.resolved_by_email || 'reviewer'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="catalogue-stack__composer">
          <button
            type="button"
            className="btn-secondary catalogue-stack__open-btn"
            onClick={() => onOpenPreview(family.id)}
          >
            Open to comment or pin
          </button>
        </div>
      </div>
    </article>
  );
}
