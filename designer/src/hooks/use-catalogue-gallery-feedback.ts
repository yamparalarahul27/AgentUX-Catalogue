import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getContainLayout,
  type ImageSize,
  type LightboxAnnotation,
} from '../lib/catalogue-lightbox';
import {
  deleteAnnotation as deleteAnnotationApi,
  fetchAnnotationsForScreenshot,
  insertAnnotation,
  type ScreenshotAnnotation,
} from '../lib/screenshot-annotations';
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
  onAnnotationStateChange?: (screenshotId: string, activity: { count: number; lastAddedAt: string | null }) => void;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
  onRequireAuth?: () => void;
  screenshot: ScreenshotNode | null;
  userEmail: string;
}

function toLightboxAnnotation(row: ScreenshotAnnotation): LightboxAnnotation {
  return {
    id: row.id,
    shape: row.shape,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    text: row.text,
    user_email: row.user_email || 'Unknown',
    created_at: row.created_at,
  };
}

function summarizeAnnotationActivity(annotations: LightboxAnnotation[]): { count: number; lastAddedAt: string | null } {
  let lastAddedAt: string | null = null;
  for (const annotation of annotations) {
    if (!annotation.created_at) continue;
    if (!lastAddedAt || new Date(annotation.created_at).getTime() > new Date(lastAddedAt).getTime()) {
      lastAddedAt = annotation.created_at;
    }
  }
  return { count: annotations.length, lastAddedAt };
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
    setAnnotations([]);
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

    fetchAnnotationsForScreenshot(screenshot.id).then((rows) => {
      if (cancelled) return;
      setAnnotations(rows.map(toLightboxAnnotation));
    });

    return () => {
      cancelled = true;
    };
  }, [screenshot?.id]);

  const notifyAnnotationActivity = useCallback((nextAnnotations: LightboxAnnotation[]) => {
    if (!screenshot) return;
    onAnnotationStateChange?.(screenshot.id, summarizeAnnotationActivity(nextAnnotations));
  }, [onAnnotationStateChange, screenshot]);

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
    if (!ensureCanEdit() || !screenshot) return;
    const trimmed = annotationDraftText.trim();
    if (!annotationDraft || !trimmed) return;

    const inserted = await insertAnnotation({
      screenshot_id: screenshot.id,
      shape: 'pin',
      x: annotationDraft.x,
      y: annotationDraft.y,
      width: null,
      height: null,
      text: trimmed,
      user_email: userEmail,
    });
    if (!inserted) {
      setAnnotationError('Could not save the pin right now.');
      return;
    }

    const next = [...annotations, toLightboxAnnotation(inserted)];
    setAnnotations(next);
    setAnnotationError('');
    notifyAnnotationActivity(next);
    setSelectedAnnotationId(inserted.id);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }, [annotationDraft, annotationDraftText, annotations, ensureCanEdit, notifyAnnotationActivity, screenshot, userEmail]);

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    if (!ensureCanEdit()) return;
    const ok = await deleteAnnotationApi(annotationId);
    if (!ok) {
      setAnnotationError('Could not delete the annotation right now.');
      return;
    }
    const next = annotations.filter((annotation) => annotation.id !== annotationId);
    setAnnotations(next);
    setAnnotationError('');
    notifyAnnotationActivity(next);
    if (selectedAnnotationId === annotationId) {
      setSelectedAnnotationId(null);
    }
  }, [annotations, ensureCanEdit, notifyAnnotationActivity, selectedAnnotationId]);

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
