import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import { formatDateTime, getAnnotationId, getContainLayout, parseAnnotations, type ImageSize, type LightboxAnnotation } from '../lib/catalogue-lightbox';
import { getGroupColor } from '../lib/naming';
import { ANNOTATION_METADATA_KEY } from '../lib/catalogue-activity';
import { supabase } from '../lib/supabase';

interface CatalogueFamilyLightboxProps {
  activeVariantKey: string | null;
  family: CatalogueFamilyView;
  flowName: string | null;
  isOpen: boolean;
  projectName: string;
  userEmail: string;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAnnotationStateChange: (screenshotId: string, metadata: Record<string, unknown>) => void;
  onAssignFlow: (familyId: string) => void;
  onClose: () => void;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
}

interface ScreenshotComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
}

type LightboxPanel = 'comments' | 'annotations';

export function CatalogueFamilyLightbox({
  activeVariantKey,
  family,
  flowName,
  isOpen,
  projectName,
  userEmail,
  onActiveVariantChange,
  onAnnotationStateChange,
  onAssignFlow,
  onClose,
  onCommentCountChange,
  onDeleteFamily,
  onOpenDetails,
  onReplaceVariantImage,
}: CatalogueFamilyLightboxProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const [lightboxPanel, setLightboxPanel] = useState<LightboxPanel>('comments');
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [annotations, setAnnotations] = useState<LightboxAnnotation[]>([]);
  const [annotationMetadata, setAnnotationMetadata] = useState<Record<string, unknown>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationDraftText, setAnnotationDraftText] = useState('');
  const [annotationDraft, setAnnotationDraft] = useState<{ x: number; y: number } | null>(null);
  const [annotationError, setAnnotationError] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [mediaSize, setMediaSize] = useState<ImageSize | null>(null);

  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey),
    [activeVariantKey, family],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const mediaLayout = useMemo(() => getContainLayout(mediaSize, imageSize), [imageSize, mediaSize]);
  const groupColor = getGroupColor(family.group);

  useEffect(() => {
    if (!isOpen || !screenshot) return;
    setLightboxPanel('comments');
    setComments([]);
    setNewComment('');
    setCommentsError('');
    setLoadingComments(true);
    setAnnotations(parseAnnotations(screenshot.metadata));
    setAnnotationMetadata(screenshot.metadata || {});
    setSelectedAnnotationId(null);
    setAnnotationMode(false);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
    setAnnotationError('');
    setImageSize(null);
    setMediaSize(null);

    let cancelled = false;
    supabase
      .from('screenshot_comments')
      .select('*')
      .eq('screenshot_id', screenshot.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingComments(false);
        if (error || !data) {
          setCommentsError('Unable to load comments right now.');
          setComments([]);
          return;
        }
        setComments(data as ScreenshotComment[]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, screenshot]);

  useEffect(() => {
    if (!isOpen || !mediaRef.current) return;
    const update = () => {
      if (!mediaRef.current) return;
      setMediaSize({ width: mediaRef.current.clientWidth, height: mediaRef.current.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(mediaRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isOpen, screenshot?.id]);

  useEffect(() => {
    if (!annotationDraft) return;
    annotationInputRef.current?.focus();
    annotationInputRef.current?.select();
  }, [annotationDraft]);

  const saveAnnotations = useCallback(async (nextAnnotations: LightboxAnnotation[]) => {
    if (!screenshot) return false;
    const nextMetadata = {
      ...annotationMetadata,
      [ANNOTATION_METADATA_KEY]: JSON.stringify(nextAnnotations),
    };

    const { error } = await supabase
      .from('screenshots')
      .update({ metadata: nextMetadata })
      .eq('id', screenshot.id);

    if (error) {
      setAnnotationError('Could not save annotations right now.');
      return false;
    }

    setAnnotations(nextAnnotations);
    setAnnotationMetadata(nextMetadata);
    setAnnotationError('');
    onAnnotationStateChange(screenshot.id, nextMetadata);
    return true;
  }, [annotationMetadata, onAnnotationStateChange, screenshot]);

  const addComment = useCallback(async () => {
    if (!screenshot) return;
    const trimmed = newComment.trim();
    if (!trimmed) return;

    const { data, error } = await supabase
      .from('screenshot_comments')
      .insert({ screenshot_id: screenshot.id, user_email: userEmail, text: trimmed })
      .select()
      .single();

    if (error || !data) {
      setCommentsError('Unable to add this comment.');
      return;
    }

    setComments((previous) => [...previous, data as ScreenshotComment]);
    setNewComment('');
    setCommentsError('');
    onCommentCountChange?.(screenshot.id, 1);
  }, [newComment, onCommentCountChange, screenshot, userEmail]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!screenshot) return;
    const { error } = await supabase.from('screenshot_comments').delete().eq('id', commentId);
    if (error) {
      setCommentsError('Unable to delete this comment.');
      return;
    }
    setComments((previous) => previous.filter((comment) => comment.id !== commentId));
    onCommentCountChange?.(screenshot.id, -1);
  }, [onCommentCountChange, screenshot]);

  function handleMediaClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!annotationMode || !mediaLayout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left - mediaLayout.left;
    const relativeY = event.clientY - rect.top - mediaLayout.top;

    if (relativeX < 0 || relativeY < 0 || relativeX > mediaLayout.width || relativeY > mediaLayout.height) {
      return;
    }

    setAnnotationDraft({
      x: (relativeX / mediaLayout.width) * 100,
      y: (relativeY / mediaLayout.height) * 100,
    });
    setLightboxPanel('annotations');
    setAnnotationError('');
  }

  async function addAnnotation() {
    const trimmed = annotationDraftText.trim();
    if (!annotationDraft || !trimmed) return;

    const item: LightboxAnnotation = {
      id: getAnnotationId(),
      x: annotationDraft.x,
      y: annotationDraft.y,
      text: trimmed,
      user_email: userEmail,
      created_at: new Date().toISOString(),
    };
    const nextAnnotations = [...annotations, item];
    const saved = await saveAnnotations(nextAnnotations);
    if (!saved) return;

    setSelectedAnnotationId(item.id);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }

  async function deleteAnnotation(annotationId: string) {
    const nextAnnotations = annotations.filter((annotation) => annotation.id !== annotationId);
    const saved = await saveAnnotations(nextAnnotations);
    if (!saved) return;
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  }

  async function requestDeleteFamily() {
    const shouldDelete = window.confirm(`Delete "${family.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
    onClose();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && screenshot) {
      void onReplaceVariantImage(screenshot.id, file);
    }
    event.target.value = '';
  }

  function toggleAnnotationMode() {
    setAnnotationError('');
    setAnnotationMode((current) => {
      const next = !current;
      if (!next) {
        setAnnotationDraft(null);
        setAnnotationDraftText('');
      }
      return next;
    });
  }

  function openDetails() {
    onClose();
    onOpenDetails(family.id);
  }

  if (!isOpen || !screenshot || !activeVariant) {
    return null;
  }

  return createPortal(
    <div className="catalogue-lightbox" onClick={onClose}>
      <div className="catalogue-lightbox-header" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-name-wrap">
          <span className="catalogue-lightbox-name">{family.name}</span>
          <button type="button" className="catalogue-lightbox-name-edit" title="Edit details" onClick={openDetails}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
        {family.group && <span className="catalogue-lightbox-group" style={{ borderColor: groupColor, color: groupColor }}>{family.group}</span>}
        {screenshot.platform && <span className="catalogue-lightbox-tag">{screenshot.platform}</span>}
        {screenshot.theme && <span className="catalogue-lightbox-tag">{screenshot.theme}</span>}
        <button type="button" className="catalogue-lightbox-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="catalogue-lightbox-body" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-media" ref={mediaRef} onClick={handleMediaClick} style={{ cursor: annotationMode ? 'crosshair' : 'default' }}>
          <img
            src={screenshot.image_url}
            alt={`${family.name} ${activeVariant.label}`}
            className="catalogue-lightbox-img"
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            draggable={false}
          />
          {mediaLayout && (
            <div className="catalogue-lightbox-pin-layer" aria-hidden="true">
              {annotations.map((annotation, index) => (
                <button
                  key={annotation.id}
                  type="button"
                  className={`catalogue-lightbox-pin ${selectedAnnotationId === annotation.id ? 'is-active' : ''}`}
                  style={{
                    left: `${mediaLayout.left + (annotation.x / 100) * mediaLayout.width}px`,
                    top: `${mediaLayout.top + (annotation.y / 100) * mediaLayout.height}px`,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAnnotationId(annotation.id);
                    setLightboxPanel('annotations');
                  }}
                  title={annotation.text}
                >
                  <span>{index + 1}</span>
                </button>
              ))}
              {annotationDraft && (
                <button
                  type="button"
                  className="catalogue-lightbox-pin catalogue-lightbox-pin-draft is-active"
                  style={{
                    left: `${mediaLayout.left + (annotationDraft.x / 100) * mediaLayout.width}px`,
                    top: `${mediaLayout.top + (annotationDraft.y / 100) * mediaLayout.height}px`,
                  }}
                  title="Draft annotation"
                >
                  <span>+</span>
                </button>
              )}
            </div>
          )}
          {annotationMode && <div className="catalogue-lightbox-media-hint">Click the image to place a pin</div>}
        </div>

        <div className="catalogue-lightbox-comments">
          <div className="catalogue-family-lightbox__meta">
            <div className="catalogue-family-lightbox__meta-row">
              <span>Project</span>
              <strong>{projectName}</strong>
            </div>
            <div className="catalogue-family-lightbox__meta-row">
              <span>Flow</span>
              <button
                type="button"
                className="catalogue-gallery-flow"
                onClick={() => {
                  onAssignFlow(family.id);
                  onClose();
                }}
              >
                {flowName || 'Unassigned'}
              </button>
            </div>
          </div>

          <div className="catalogue-family-lightbox__variant-strip">
            {family.variants.map((variant) => (
              <button
                key={variant.key}
                type="button"
                className={`catalogue-family-card__variant ${activeVariant.key === variant.key ? 'is-active' : ''}`}
                onClick={() => onActiveVariantChange(family.id, variant.key)}
              >
                {variant.label}
              </button>
            ))}
          </div>

          <div className="catalogue-family-lightbox__actions">
            <button type="button" className="catalogue-family-card__action" onClick={openDetails}>Edit details</button>
            <button type="button" className="catalogue-family-card__action" onClick={() => fileRef.current?.click()}>Reupload</button>
            <button type="button" className="catalogue-family-card__action is-danger" onClick={() => void requestDeleteFamily()}>Delete</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
          </div>

          <div className="catalogue-lightbox-panel-tabs" role="tablist" aria-label="Lightbox details">
            <button
              type="button"
              role="tab"
              aria-selected={lightboxPanel === 'comments'}
              className={`catalogue-lightbox-tab ${lightboxPanel === 'comments' ? 'is-active' : ''}`}
              onClick={() => setLightboxPanel('comments')}
            >
              Comments ({comments.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lightboxPanel === 'annotations'}
              className={`catalogue-lightbox-tab ${lightboxPanel === 'annotations' ? 'is-active' : ''}`}
              onClick={() => setLightboxPanel('annotations')}
            >
              Annotations ({annotations.length})
            </button>
          </div>

          {lightboxPanel === 'comments' ? (
            <>
              <div className="catalogue-lightbox-comments-list">
                {loadingComments ? (
                  <div className="catalogue-lightbox-comments-empty"><div className="loading-spinner" /></div>
                ) : commentsError ? (
                  <p className="catalogue-lightbox-comments-empty">{commentsError}</p>
                ) : comments.length === 0 ? (
                  <p className="catalogue-lightbox-comments-empty">No comments yet</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="catalogue-lightbox-comment">
                      <div className="catalogue-lightbox-comment-top">
                        <span className="catalogue-lightbox-comment-email">{comment.user_email}</span>
                        <span className="catalogue-lightbox-comment-time">{formatDateTime(comment.created_at)}</span>
                        {comment.user_email === userEmail && (
                          <button
                            type="button"
                            className="catalogue-lightbox-comment-delete"
                            title="Delete comment"
                            onClick={() => void deleteComment(comment.id)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <p className="catalogue-lightbox-comment-text">{comment.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="catalogue-lightbox-comment-input">
                <input
                  type="text"
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addComment();
                  }}
                  placeholder="Add a comment..."
                />
                <button type="button" onClick={() => void addComment()} disabled={!newComment.trim()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="catalogue-lightbox-annotation-toolbar">
                <button
                  type="button"
                  className={`catalogue-lightbox-annotation-toggle ${annotationMode ? 'is-active' : ''}`}
                  onClick={toggleAnnotationMode}
                >
                  {annotationMode ? 'Placement mode on' : 'Add pin'}
                </button>
                <span className="catalogue-lightbox-annotation-toolbar-copy">
                  {annotationMode ? 'Click the image, then add a note.' : 'Select a pin to inspect it.'}
                </span>
              </div>
              {annotationError && <p className="catalogue-lightbox-annotation-error">{annotationError}</p>}
              {annotationDraft && (
                <div className="catalogue-lightbox-annotation-composer">
                  <div className="catalogue-lightbox-annotation-composer-label">
                    New pin at {annotationDraft.x.toFixed(1)}%, {annotationDraft.y.toFixed(1)}%
                  </div>
                  <input
                    ref={annotationInputRef}
                    type="text"
                    value={annotationDraftText}
                    onChange={(event) => setAnnotationDraftText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addAnnotation();
                      if (event.key === 'Escape') {
                        setAnnotationDraft(null);
                        setAnnotationDraftText('');
                      }
                    }}
                    placeholder="Write annotation text..."
                  />
                  <div className="catalogue-lightbox-annotation-composer-actions">
                    <button
                      type="button"
                      className="catalogue-lightbox-annotation-save"
                      onClick={() => void addAnnotation()}
                      disabled={!annotationDraftText.trim()}
                    >
                      Save pin
                    </button>
                    <button
                      type="button"
                      className="catalogue-lightbox-annotation-cancel"
                      onClick={() => {
                        setAnnotationDraft(null);
                        setAnnotationDraftText('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div className="catalogue-lightbox-annotation-list">
                {annotations.length === 0 ? (
                  <p className="catalogue-lightbox-comments-empty">No annotations yet</p>
                ) : (
                  annotations.map((annotation, index) => (
                    <div
                      key={annotation.id}
                      role="button"
                      tabIndex={0}
                      className={`catalogue-lightbox-annotation-item ${selectedAnnotationId === annotation.id ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedAnnotationId(annotation.id);
                        setLightboxPanel('annotations');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedAnnotationId(annotation.id);
                        }
                      }}
                    >
                      <div className="catalogue-lightbox-annotation-item-top">
                        <span className="catalogue-lightbox-annotation-badge">{index + 1}</span>
                        <span className="catalogue-lightbox-annotation-time">{formatDateTime(annotation.created_at)}</span>
                        {annotation.user_email === userEmail && (
                          <button
                            type="button"
                            className="catalogue-lightbox-annotation-delete"
                            title="Delete annotation"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteAnnotation(annotation.id);
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <p className="catalogue-lightbox-annotation-text">{annotation.text}</p>
                      <span className="catalogue-lightbox-annotation-coords">
                        {annotation.x.toFixed(1)}%, {annotation.y.toFixed(1)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
