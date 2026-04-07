import { useCallback, useEffect, useMemo, useState } from 'react';

import { ANNOTATION_METADATA_KEY } from '../lib/catalogue-activity';
import {
  getAnnotationId,
  getContainLayout,
  parseAnnotations,
  type ImageSize,
  type LightboxAnnotation,
} from '../lib/catalogue-lightbox';
import { supabase } from '../lib/supabase';
import type { ScreenshotNode } from '../types';

export type CatalogueGalleryPanel = 'comments' | 'annotations';

type ScreenshotComment = {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_email?: string | null;
};

interface UseCatalogueGalleryFeedbackArgs {
  canEdit?: boolean;
  onAnnotationStateChange?: (screenshotId: string, metadata: Record<string, unknown>) => void;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
  onRequireAuth?: () => void;
  screenshot: ScreenshotNode | null;
  userEmail: string;
}

interface PlaceAnnotationArgs {
  clientX: number;
  clientY: number;
  rect: DOMRect;
}

export interface CatalogueGalleryFeedbackState {
  annotationDraft: { x: number; y: number } | null;
  annotationDraftText: string;
  annotationError: string;
  annotationMode: boolean;
  annotations: LightboxAnnotation[];
  comments: ScreenshotComment[];
  commentsError: string;
  loadingComments: boolean;
  mediaLayout: ReturnType<typeof getContainLayout>;
  newComment: string;
  panel: CatalogueGalleryPanel;
  savingComment: boolean;
  selectedAnnotationId: string | null;
  addAnnotation: () => Promise<void>;
  addComment: () => Promise<void>;
  cancelAnnotationDraft: () => void;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  placeAnnotationDraft: (args: PlaceAnnotationArgs) => boolean;
  selectAnnotation: (annotationId: string) => void;
  setAnnotationDraftText: React.Dispatch<React.SetStateAction<string>>;
  setImageSize: React.Dispatch<React.SetStateAction<ImageSize | null>>;
  setMediaSize: React.Dispatch<React.SetStateAction<ImageSize | null>>;
  setNewComment: React.Dispatch<React.SetStateAction<string>>;
  setPanel: React.Dispatch<React.SetStateAction<CatalogueGalleryPanel>>;
  toggleAnnotationMode: () => void;
}

export function useCatalogueGalleryFeedback({
  canEdit = true,
  onAnnotationStateChange,
  onCommentCountChange,
  onRequireAuth,
  screenshot,
  userEmail,
}: UseCatalogueGalleryFeedbackArgs): CatalogueGalleryFeedbackState {
  const [panel, setPanel] = useState<CatalogueGalleryPanel>('comments');
  const [comments, setComments] = useState<ScreenshotComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
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

  const mediaLayout = useMemo(() => getContainLayout(mediaSize, imageSize), [imageSize, mediaSize]);

  const ensureCanEdit = useCallback(() => {
    if (canEdit) return true;
    onRequireAuth?.();
    return false;
  }, [canEdit, onRequireAuth]);

  useEffect(() => {
    if (!screenshot) {
      setPanel('comments');
      setComments([]);
      setNewComment('');
      setLoadingComments(false);
      setSavingComment(false);
      setCommentsError('');
      setAnnotations([]);
      setAnnotationMetadata({});
      setSelectedAnnotationId(null);
      setAnnotationMode(false);
      setAnnotationDraftText('');
      setAnnotationDraft(null);
      setAnnotationError('');
      setImageSize(null);
      setMediaSize(null);
      return;
    }

    setPanel('comments');
    setComments([]);
    setNewComment('');
    setLoadingComments(true);
    setSavingComment(false);
    setCommentsError('');
    setAnnotations(parseAnnotations(screenshot.metadata));
    setAnnotationMetadata(screenshot.metadata || {});
    setSelectedAnnotationId(null);
    setAnnotationMode(false);
    setAnnotationDraftText('');
    setAnnotationDraft(null);
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
  }, [screenshot?.id]);

  const saveAnnotations = useCallback(async (nextAnnotations: LightboxAnnotation[]) => {
    if (!ensureCanEdit()) return false;
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
    onAnnotationStateChange?.(screenshot.id, nextMetadata);
    return true;
  }, [annotationMetadata, ensureCanEdit, onAnnotationStateChange, screenshot]);

  const addComment = useCallback(async () => {
    if (!ensureCanEdit()) return;
    if (!screenshot || savingComment) return;

    const trimmed = newComment.trim();
    if (!trimmed) return;

    setSavingComment(true);

    try {
      const { data, error } = await supabase
        .from('screenshot_comments')
        .insert({ screenshot_id: screenshot.id, user_email: userEmail, text: trimmed })
        .select('*')
        .single();

      if (error || !data) {
        setCommentsError('Unable to add this comment.');
        return;
      }

      setComments((previous) => [...previous, data as ScreenshotComment]);
      setNewComment('');
      setCommentsError('');
      onCommentCountChange?.(screenshot.id, 1);
    } finally {
      setSavingComment(false);
    }
  }, [ensureCanEdit, newComment, onCommentCountChange, savingComment, screenshot, userEmail]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!ensureCanEdit()) return;
    if (!screenshot) return;

    const { error } = await supabase
      .from('screenshot_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      setCommentsError('Unable to delete this comment.');
      return;
    }

    setComments((previous) => previous.filter((comment) => comment.id !== commentId));
    setCommentsError('');
    onCommentCountChange?.(screenshot.id, -1);
  }, [ensureCanEdit, onCommentCountChange, screenshot]);

  const placeAnnotationDraft = useCallback(({ clientX, clientY, rect }: PlaceAnnotationArgs) => {
    if (!annotationMode || !mediaLayout) return false;

    const relativeX = clientX - rect.left - mediaLayout.left;
    const relativeY = clientY - rect.top - mediaLayout.top;

    if (relativeX < 0 || relativeY < 0 || relativeX > mediaLayout.width || relativeY > mediaLayout.height) {
      return false;
    }

    setAnnotationDraft({
      x: (relativeX / mediaLayout.width) * 100,
      y: (relativeY / mediaLayout.height) * 100,
    });
    setPanel('annotations');
    setAnnotationError('');
    return true;
  }, [annotationMode, mediaLayout]);

  const addAnnotation = useCallback(async () => {
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
  }, [annotationDraft, annotationDraftText, annotations, saveAnnotations, userEmail]);

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    const nextAnnotations = annotations.filter((annotation) => annotation.id !== annotationId);
    const saved = await saveAnnotations(nextAnnotations);
    if (!saved) return;

    if (selectedAnnotationId === annotationId) {
      setSelectedAnnotationId(null);
    }
  }, [annotations, saveAnnotations, selectedAnnotationId]);

  const selectAnnotation = useCallback((annotationId: string) => {
    setSelectedAnnotationId(annotationId);
    setPanel('annotations');
  }, []);

  const cancelAnnotationDraft = useCallback(() => {
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }, []);

  const toggleAnnotationMode = useCallback(() => {
    if (!annotationMode && !ensureCanEdit()) return;

    setAnnotationError('');
    setAnnotationMode((current) => {
      const next = !current;
      if (!next) {
        setAnnotationDraft(null);
        setAnnotationDraftText('');
      }
      return next;
    });
  }, [annotationMode, ensureCanEdit]);

  return {
    annotationDraft,
    annotationDraftText,
    annotationError,
    annotationMode,
    annotations,
    comments,
    commentsError,
    loadingComments,
    mediaLayout,
    newComment,
    panel,
    savingComment,
    selectedAnnotationId,
    addAnnotation,
    addComment,
    cancelAnnotationDraft,
    deleteAnnotation,
    deleteComment,
    placeAnnotationDraft,
    selectAnnotation,
    setAnnotationDraftText,
    setImageSize,
    setMediaSize,
    setNewComment,
    setPanel,
    toggleAnnotationMode,
  };
}
