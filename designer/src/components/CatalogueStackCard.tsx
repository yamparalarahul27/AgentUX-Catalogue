import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, MapPin, MessageCircle, Square } from 'lucide-react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { formatDateTime, type LightboxAnnotation } from '../lib/catalogue-lightbox';
import { fetchAnnotationsForScreenshot } from '../lib/screenshot-annotations';
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

  const [annotations, setAnnotations] = useState<LightboxAnnotation[]>([]);

  useEffect(() => {
    if (!screenshot) {
      setAnnotations([]);
      return;
    }
    let cancelled = false;
    fetchAnnotationsForScreenshot(screenshot.id).then((rows) => {
      if (cancelled) return;
      setAnnotations(rows.map((row) => ({
        id: row.id,
        shape: row.shape,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        text: row.text,
        user_email: row.user_email || 'Unknown',
        created_at: row.created_at,
      })));
    });
    return () => {
      cancelled = true;
    };
  }, [screenshot?.id]);

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
    <article className={`catalogue-stack__card ${isSelected ? 'is-selected' : ''}`} data-family-id={family.id}>
      <div className="catalogue-stack__media">
        <button
          type="button"
          className={`catalogue-stack__select ${isSelected ? 'is-selected' : ''}`}
          onClick={() => onToggleSelect(family.id)}
          title={isSelected ? 'Deselect' : 'Select'}
          aria-label={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
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
              <MessageCircle size={14} />
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </span>
            <span className="catalogue-stack__counter">
              <MapPin size={14} />
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
