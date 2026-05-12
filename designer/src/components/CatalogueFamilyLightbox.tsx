import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant, getVariantKey } from '../lib/catalogue-families';
import { formatDateTime, getContainLayout, type ImageSize, type LightboxAnnotation } from '../lib/catalogue-lightbox';
import { getGroupColor } from '../lib/naming';
import {
  deleteAnnotation as deleteAnnotationApi,
  fetchAnnotationsForScreenshot,
  insertAnnotation,
  type ScreenshotAnnotation,
} from '../lib/screenshot-annotations';
import { supabase } from '../lib/supabase';
import type { MobileOs, WebPreset } from '../types';
import { Check, Copy, Send, X } from 'lucide-react';

import { buildLightboxDraftVariant } from './CatalogueFamilyLightboxInlineEditor';
import { CatalogueFamilyLightboxActions } from './CatalogueFamilyLightboxActions';
import { CatalogueLightboxCrop } from './CatalogueLightboxCrop';
import { CatalogueFamilyLightboxCommentItem } from './CatalogueFamilyLightboxCommentItem';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { LabelEditor } from './labeling/LabelEditor';
import { AI_LABELING_PROMPT } from '../lib/labeling/ai-prompt';
import { ANNOTATION_EDIT_MIN_VIEWPORT_PX, PIN_ANNOTATIONS_ENABLED } from '../lib/feature-flags';
import { ConfirmModal } from './ConfirmModal';
interface CatalogueFamilyLightboxProps {
  activeVariantKey: string | null;
  canEdit?: boolean;
  existingAnnotationLabels?: string[];
  existingGroups: string[];
  family: CatalogueFamilyView;
  flowName: string | null;
  isAdmin?: boolean;
  isOpen: boolean;
  isLoadingNext?: boolean;
  onRequireAuth?: () => void;
  showLabelTab?: boolean;
  onLabelPersisted?: (screenshotId: string, label: import('../lib/labeling/types').ScreenshotLabel) => void;
  startInlineEdit?: boolean;
  userEmail: string;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAnnotationStateChange: (screenshotId: string, activity: { count: number; lastAddedAt: string | null }) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onCommentCountChange?: (screenshotId: string, delta: number) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onSetReference: (screenshotId: string, input: { file: File | null; label: string | null }) => Promise<boolean>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onCropVariantImage: (
    screenshotId: string,
    topTrim: number,
    bottomTrim: number,
    leftTrim: number,
    rightTrim: number,
  ) => Promise<{ ok: boolean }>;
  onSetFlowLabel: (familyId: string, flowLabel: string | null) => Promise<boolean>;
  onUpdateVariantDetails: (screenshotId: string, patch: { mobile_os?: MobileOs | null; platform?: 'mobile' | 'web' | null; theme?: 'light' | 'dark' | null; web_preset_key?: string | null }) => Promise<boolean>;
  webPresets: WebPreset[];
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (screenshotId: string) => void;
}
type ScreenshotComment = { id: string; user_email: string; text: string; created_at: string };
type LightboxPanel = 'label' | 'comments' | 'annotations';
type AnnotationDraft = { shape: 'pin' | 'area'; x: number; y: number; width: number; height: number };
type DrawingState = { startX: number; startY: number; currentX: number; currentY: number };

const DRAG_THRESHOLD_PERCENT = 0.8; // ~0.8% of image dimension counts as a drag (otherwise: click)

const shouldStartLightboxSheetMinimized = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
const isAnnotationEditAllowedNow = () => typeof window !== 'undefined' && window.innerWidth > ANNOTATION_EDIT_MIN_VIEWPORT_PX;

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
export function CatalogueFamilyLightbox({
  activeVariantKey,
  canEdit = true,
  existingAnnotationLabels = [],
  existingGroups,
  family,
  flowName,
  isAdmin = false,
  isOpen,
  isLoadingNext = false,
  onRequireAuth,
  showLabelTab = false,
  onLabelPersisted,
  startInlineEdit = false,
  userEmail,
  onActiveVariantChange,
  onAnnotationStateChange,
  onClose,
  onPrev,
  onNext,
  onCommentCountChange,
  onChangeFamilyGroup,
  onDeleteFamily,
  onRenameFamily,
  onSetReference,
  onReplaceVariantImage,
  onCropVariantImage,
  onSetFlowLabel,
  onUpdateVariantDetails,
  webPresets,
  bookmarkedIds,
  onToggleBookmark,
}: CatalogueFamilyLightboxProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const [lightboxPanel, setLightboxPanel] = useState<LightboxPanel>(showLabelTab ? 'label' : 'comments');
  const [promptCopied, setPromptCopied] = useState(false);

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_LABELING_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1500);
    } catch {
      // Older browsers without clipboard permission — silently no-op.
      // Studio is admin-only, so this path is vanishingly rare.
    }
  }
  const [sheetMinimized, setSheetMinimized] = useState(shouldStartLightboxSheetMinimized);
  const [isInlineEditing, setIsInlineEditing] = useState(startInlineEdit && canEdit);
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [nameDraft, setNameDraft] = useState(family.name); const [groupDraft, setGroupDraft] = useState(family.group || ''); const [flowDraft, setFlowDraft] = useState(flowName || '');
  const [themeDraft, setThemeDraft] = useState<'light' | 'dark' | null>(null); const [platformDraft, setPlatformDraft] = useState<'mobile' | 'web' | null>(null);
  const [webPresetDraft, setWebPresetDraft] = useState<string | null>(null); const [mobileOsDraft, setMobileOsDraft] = useState<MobileOs | null>(null);
  const [referenceLabelDraft, setReferenceLabelDraft] = useState(''); const [referenceFileDraft, setReferenceFileDraft] = useState<File | null>(null);
  const [comments, setComments] = useState<ScreenshotComment[]>([]); const [newComment, setNewComment] = useState(''); const [loadingComments, setLoadingComments] = useState(false); const [commentsError, setCommentsError] = useState('');
  const [annotations, setAnnotations] = useState<LightboxAnnotation[]>([]); const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false); const [annotationDraftText, setAnnotationDraftText] = useState(''); const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null); const [drawing, setDrawing] = useState<DrawingState | null>(null); const [annotationError, setAnnotationError] = useState('');
  const [annotationEditAllowed, setAnnotationEditAllowed] = useState<boolean>(() => isAnnotationEditAllowedNow());
  const [imageSize, setImageSize] = useState<ImageSize | null>(null); const [mediaSize, setMediaSize] = useState<ImageSize | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [comments],
  );
  const activeVariant = useMemo(() => getActiveFamilyVariant(family, activeVariantKey), [activeVariantKey, family]); const screenshot = activeVariant?.screenshot ?? null;
  const mediaLayout = useMemo(() => getContainLayout(mediaSize, imageSize), [imageSize, mediaSize]);
  const groupColor = getGroupColor(family.group);

  function ensureCanEdit() { if (canEdit) return true; onRequireAuth?.(); return false; }

  useEffect(() => {
    if (!isOpen || !screenshot) return;
    setLightboxPanel(showLabelTab ? 'label' : 'comments');
    setSheetMinimized(shouldStartLightboxSheetMinimized());
    setComments([]);
    setNewComment('');
    setCommentsError('');
    setLoadingComments(true);
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setAnnotationMode(false);
    setAnnotationDraft(null);
    setDrawing(null);
    setAnnotationDraftText('');
    setAnnotationError('');
    setImageSize(null);
    setMediaSize(null);
    setCropMode(false);
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
  }, [isOpen, screenshot]);
  useEffect(() => {
    if (!screenshot) return;
    setNameDraft(family.name);
    setGroupDraft(family.group || '');
    setFlowDraft(flowName || '');
    setThemeDraft(screenshot.theme || null);
    setPlatformDraft(screenshot.platform || null);
    setWebPresetDraft(screenshot.web_preset_key || null);
    setMobileOsDraft(screenshot.mobile_os || null);
    setReferenceLabelDraft(screenshot.reference_label || '');
    setReferenceFileDraft(null);
    setIsInlineEditing(startInlineEdit && canEdit);
    setIsSavingInline(false);
  }, [canEdit, family, flowName, screenshot, startInlineEdit]);
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
  useEffect(() => {
    function handleResize() {
      setAnnotationEditAllowed(isAnnotationEditAllowedNow());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (!annotationEditAllowed && annotationMode) {
      setAnnotationMode(false);
      setAnnotationDraft(null);
      setDrawing(null);
      setAnnotationDraftText('');
    }
  }, [annotationEditAllowed, annotationMode]);
  useEffect(() => {
    if (!isOpen) return;
    function handleNavKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (annotationMode || annotationDraft) return;
      if (confirmDeleteOpen) return;
      if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener('keydown', handleNavKey);
    return () => window.removeEventListener('keydown', handleNavKey);
  }, [isOpen, onPrev, onNext, annotationMode, annotationDraft, confirmDeleteOpen]);
  useEffect(() => {
    if (!isOpen || !selectedAnnotationId) return;
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      setSelectedAnnotationId(null);
    }
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, selectedAnnotationId]);
  const notifyAnnotationActivity = useCallback((nextAnnotations: LightboxAnnotation[]) => {
    if (!screenshot) return;
    onAnnotationStateChange(screenshot.id, summarizeAnnotationActivity(nextAnnotations));
  }, [onAnnotationStateChange, screenshot]);
  const addComment = useCallback(async () => {
    if (!ensureCanEdit()) return;
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
  }, [canEdit, newComment, onCommentCountChange, onRequireAuth, screenshot, userEmail]);
  const deleteComment = useCallback(async (commentId: string) => {
    if (!ensureCanEdit()) return;
    if (!screenshot) return;
    const { error } = await supabase.from('screenshot_comments').delete().eq('id', commentId);
    if (error) {
      setCommentsError('Unable to delete this comment.');
      return;
    }
    setComments((previous) => previous.filter((comment) => comment.id !== commentId));
    onCommentCountChange?.(screenshot.id, -1);
  }, [canEdit, onCommentCountChange, onRequireAuth, screenshot]);
  function getRelativePosition(event: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null {
    if (!mediaLayout) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left - mediaLayout.left;
    const relativeY = event.clientY - rect.top - mediaLayout.top;
    const clampedX = Math.max(0, Math.min(mediaLayout.width, relativeX));
    const clampedY = Math.max(0, Math.min(mediaLayout.height, relativeY));
    return {
      x: (clampedX / mediaLayout.width) * 100,
      y: (clampedY / mediaLayout.height) * 100,
    };
  }
  function handleMediaMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (!annotationMode || !annotationEditAllowed) return;
    if (annotationDraft) return; // already composing — ignore further drags
    const position = getRelativePosition(event);
    if (!position) return;
    event.preventDefault();
    setDrawing({ startX: position.x, startY: position.y, currentX: position.x, currentY: position.y });
  }
  function handleMediaMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!drawing) return;
    const position = getRelativePosition(event);
    if (!position) return;
    setDrawing({ ...drawing, currentX: position.x, currentY: position.y });
  }
  function handleMediaMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (!drawing) return;
    const position = getRelativePosition(event) ?? { x: drawing.currentX, y: drawing.currentY };
    const x = Math.min(drawing.startX, position.x);
    const y = Math.min(drawing.startY, position.y);
    const width = Math.abs(position.x - drawing.startX);
    const height = Math.abs(position.y - drawing.startY);
    setDrawing(null);
    if (width < DRAG_THRESHOLD_PERCENT && height < DRAG_THRESHOLD_PERCENT) {
      // It was a click, not a drag.
      if (PIN_ANNOTATIONS_ENABLED) {
        setAnnotationDraft({ shape: 'pin', x: drawing.startX, y: drawing.startY, width: 0, height: 0 });
        setLightboxPanel('annotations');
        setAnnotationError('');
      }
      return;
    }
    setAnnotationDraft({ shape: 'area', x, y, width, height });
    setLightboxPanel('annotations');
    setAnnotationError('');
  }
  function handleMediaMouseLeave() {
    if (drawing) setDrawing(null);
  }
  function handleMediaClick() {
    if (annotationMode || drawing || annotationDraft) return;
    if (!selectedAnnotationId) return;
    setSelectedAnnotationId(null);
  }
  async function addAnnotation() {
    if (!ensureCanEdit() || !screenshot) return;
    const trimmed = annotationDraftText.trim();
    if (!annotationDraft || !trimmed) return;
    const inserted = await insertAnnotation({
      screenshot_id: screenshot.id,
      shape: annotationDraft.shape,
      x: annotationDraft.x,
      y: annotationDraft.y,
      width: annotationDraft.shape === 'area' ? annotationDraft.width : null,
      height: annotationDraft.shape === 'area' ? annotationDraft.height : null,
      text: trimmed,
      user_email: userEmail,
    });
    if (!inserted) {
      setAnnotationError('Could not save the annotation right now.');
      return;
    }
    const next = [...annotations, toLightboxAnnotation(inserted)];
    setAnnotations(next);
    setAnnotationError('');
    notifyAnnotationActivity(next);
    setSelectedAnnotationId(inserted.id);
    setAnnotationDraft(null);
    setAnnotationDraftText('');
  }
  async function deleteAnnotation(annotationId: string) {
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
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  }
  function requestDeleteFamily() {
    if (!ensureCanEdit()) return;
    setConfirmDeleteOpen(true);
  }
  async function performDeleteFamily() {
    setConfirmDeleteOpen(false);
    await onDeleteFamily(family.id);
  }
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && !ensureCanEdit()) {
      event.target.value = '';
      return;
    }
    if (file && screenshot) {
      void onReplaceVariantImage(screenshot.id, file);
    }
    event.target.value = '';
  }
  function openCropMode() {
    if (!ensureCanEdit()) return;
    if (!screenshot || !imageSize) return;
    setAnnotationMode(false);
    setAnnotationDraft(null);
    setDrawing(null);
    setCropMode(true);
  }
  async function handleApplyCrop({ topTrim, bottomTrim, leftTrim, rightTrim }: { topTrim: number; bottomTrim: number; leftTrim: number; rightTrim: number }) {
    if (!screenshot) return;
    setIsCropping(true);
    const result = await onCropVariantImage(screenshot.id, topTrim, bottomTrim, leftTrim, rightTrim);
    setIsCropping(false);
    if (result.ok) {
      setCropMode(false);
      setImageSize(null);
      const refreshed = await fetchAnnotationsForScreenshot(screenshot.id);
      const next = refreshed.map(toLightboxAnnotation);
      setAnnotations(next);
      onAnnotationStateChange(screenshot.id, summarizeAnnotationActivity(next));
    }
  }
  function toggleAnnotationMode() {
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
  }
  function handleInlinePlatformChange(nextPlatform: 'mobile' | 'web' | null) {
    setPlatformDraft(nextPlatform);
    if (nextPlatform === 'web') {
      setWebPresetDraft((current) => current || webPresets[0]?.key || null);
      setMobileOsDraft(null);
      return;
    }
    if (nextPlatform === 'mobile') {
      setMobileOsDraft((current) => current || 'ios');
      setWebPresetDraft(null);
      return;
    }
    setWebPresetDraft(null);
    setMobileOsDraft(null);
  }
  function handleInlineReferenceFileSelect(file: File | null) {
    if (!file) return setReferenceFileDraft(null);
    if (file.type.startsWith('image/')) setReferenceFileDraft(file);
  }
  async function saveInlineDetails() {
    if (!ensureCanEdit()) return;
    if (!screenshot) return;
    setIsSavingInline(true);
    try {
      const trimmedName = nameDraft.trim();
      const trimmedGroup = groupDraft.trim();
      const trimmedFlow = flowDraft.trim();
      const trimmedReferenceLabel = referenceLabelDraft.trim();
      const nextVariant = buildLightboxDraftVariant(screenshot, {
        mobileOs: mobileOsDraft,
        platform: platformDraft,
        theme: themeDraft,
        webPresetKey: webPresetDraft,
      });
      if (trimmedName && trimmedName !== family.name) {
        await onRenameFamily(family.id, trimmedName);
      }
      if (trimmedGroup !== (family.group || '')) {
        await onChangeFamilyGroup(family.id, trimmedGroup || null);
      }
      if (trimmedFlow !== (flowName || '').trim()) {
        const flowUpdated = await onSetFlowLabel(family.id, trimmedFlow || null);
        if (!flowUpdated) return;
      }
      const variantChanged = (
        nextVariant.theme !== screenshot.theme
        || nextVariant.platform !== screenshot.platform
        || nextVariant.web_preset_key !== screenshot.web_preset_key
        || nextVariant.mobile_os !== screenshot.mobile_os
      );
      if (variantChanged) {
        const updated = await onUpdateVariantDetails(screenshot.id, {
          theme: nextVariant.theme,
          platform: nextVariant.platform,
          web_preset_key: nextVariant.web_preset_key,
          mobile_os: nextVariant.mobile_os,
        });
        if (!updated) return;
        onActiveVariantChange(family.id, getVariantKey(nextVariant));
      }
      const referenceChanged = referenceFileDraft !== null || trimmedReferenceLabel !== (screenshot.reference_label || '');
      if (referenceChanged) {
        const referenceUpdated = await onSetReference(screenshot.id, {
          file: referenceFileDraft,
          label: trimmedReferenceLabel || null,
        });
        if (!referenceUpdated) return;
      }
      setIsInlineEditing(false);
    } finally {
      setIsSavingInline(false);
    }
  }
  function cancelInlineDetails() {
    if (!screenshot) return;
    setNameDraft(family.name);
    setGroupDraft(family.group || '');
    setFlowDraft(flowName || '');
    setThemeDraft(screenshot.theme || null);
    setPlatformDraft(screenshot.platform || null);
    setWebPresetDraft(screenshot.web_preset_key || null);
    setMobileOsDraft(screenshot.mobile_os || null);
    setReferenceLabelDraft(screenshot.reference_label || '');
    setReferenceFileDraft(null);
    setIsInlineEditing(false);
  }
  if (!isOpen || !screenshot || !activeVariant) {
    return null;
  }
  return createPortal(
    <>
    <div className="catalogue-lightbox" onClick={onClose}>
      <div className="catalogue-lightbox-header" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-name-wrap">
          <span className="catalogue-lightbox-name">{family.name}</span>
        </div>
        {family.group && <span className="catalogue-lightbox-group" style={{ borderColor: groupColor, color: groupColor }}><CatalogueGroupLabel group={family.group} projectId={family.project_id} /></span>}
        {screenshot.platform && <span className="catalogue-lightbox-tag">{screenshot.platform}</span>}
        {screenshot.theme && <span className="catalogue-lightbox-tag">{screenshot.theme}</span>}
        <button type="button" className="catalogue-lightbox-close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="catalogue-lightbox-body" onClick={(event) => event.stopPropagation()}>
        <div
          className="catalogue-lightbox-media"
          ref={mediaRef}
          onMouseDown={cropMode ? undefined : handleMediaMouseDown}
          onMouseMove={cropMode ? undefined : handleMediaMouseMove}
          onMouseUp={cropMode ? undefined : handleMediaMouseUp}
          onMouseLeave={cropMode ? undefined : handleMediaMouseLeave}
          onClick={cropMode ? undefined : handleMediaClick}
          style={{ cursor: !cropMode && annotationMode && annotationEditAllowed ? 'crosshair' : 'default' }}
        >
          {cropMode && imageSize && screenshot.image_url ? (
            <CatalogueLightboxCrop
              imageUrl={screenshot.image_url}
              imageAlt={`${family.name} ${activeVariant?.label ?? ''}`}
              naturalWidth={imageSize.width}
              naturalHeight={imageSize.height}
              isApplying={isCropping}
              annotationCount={annotations.length}
              onCancel={() => setCropMode(false)}
              onApply={(args) => void handleApplyCrop(args)}
            />
          ) : (
          <>
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
                annotation.shape === 'area' && annotation.width !== null && annotation.height !== null ? (
                  <button
                    key={annotation.id}
                    type="button"
                    className={`catalogue-lightbox-area ${selectedAnnotationId === annotation.id ? 'is-active' : ''}`}
                    style={{
                      left: `${mediaLayout.left + (annotation.x / 100) * mediaLayout.width}px`,
                      top: `${mediaLayout.top + (annotation.y / 100) * mediaLayout.height}px`,
                      width: `${(annotation.width / 100) * mediaLayout.width}px`,
                      height: `${(annotation.height / 100) * mediaLayout.height}px`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedAnnotationId(annotation.id);
                      setLightboxPanel('annotations');
                    }}
                    title={annotation.text}
                  >
                    <span className="catalogue-lightbox-area-label">{index + 1} · {annotation.text}</span>
                  </button>
                ) : (
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
                )
              ))}
              {drawing && (
                <div
                  className="catalogue-lightbox-area catalogue-lightbox-area--draft"
                  style={{
                    left: `${mediaLayout.left + (Math.min(drawing.startX, drawing.currentX) / 100) * mediaLayout.width}px`,
                    top: `${mediaLayout.top + (Math.min(drawing.startY, drawing.currentY) / 100) * mediaLayout.height}px`,
                    width: `${(Math.abs(drawing.currentX - drawing.startX) / 100) * mediaLayout.width}px`,
                    height: `${(Math.abs(drawing.currentY - drawing.startY) / 100) * mediaLayout.height}px`,
                  }}
                />
              )}
              {annotationDraft && annotationDraft.shape === 'area' && (
                <div
                  className="catalogue-lightbox-area catalogue-lightbox-area--draft is-active"
                  style={{
                    left: `${mediaLayout.left + (annotationDraft.x / 100) * mediaLayout.width}px`,
                    top: `${mediaLayout.top + (annotationDraft.y / 100) * mediaLayout.height}px`,
                    width: `${(annotationDraft.width / 100) * mediaLayout.width}px`,
                    height: `${(annotationDraft.height / 100) * mediaLayout.height}px`,
                  }}
                />
              )}
              {annotationDraft && annotationDraft.shape === 'pin' && (
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
          {annotationMode && annotationEditAllowed && (
            <div className="catalogue-lightbox-media-hint">
              {PIN_ANNOTATIONS_ENABLED ? 'Drag a box to mark an area, or click to drop a pin' : 'Drag a box to mark an area'}
            </div>
          )}
          {isLoadingNext && (
            <div className="catalogue-lightbox-media-loading" aria-live="polite">
              <div className="loading-spinner" />
              <span>Loading next…</span>
            </div>
          )}
          </>
          )}
        </div>
        <div className={`catalogue-lightbox-comments ${sheetMinimized ? 'is-minimized' : ''}`}>
          <button type="button" className="catalogue-lightbox-grabber" onClick={() => setSheetMinimized((v) => !v)} aria-label={sheetMinimized ? 'Expand panel' : 'Minimize panel'} />
          <div className="catalogue-family-lightbox">
            <div className="catalogue-family-lightbox__summary">
              <div className="catalogue-lightbox-meta-line">
                {family.group && <span className="catalogue-lightbox-meta-chip" style={{ borderColor: groupColor, color: groupColor }}><CatalogueGroupLabel group={family.group} projectId={family.project_id} /></span>}
                {flowName && <><span className="catalogue-lightbox-meta-sep">·</span><span className="catalogue-lightbox-meta-chip catalogue-lightbox-meta-chip--flow">{flowName}</span></>}
                {activeVariant.label && <><span className="catalogue-lightbox-meta-sep">·</span><span className="catalogue-lightbox-meta-chip catalogue-lightbox-meta-chip--variant">{activeVariant.label}</span></>}
              </div>
              {family.variants.length > 1 && (
                <div className="catalogue-lightbox-variant-dots">
                  {family.variants.map((variant) => (
                    <button
                      key={variant.key}
                      type="button"
                      className={`catalogue-lightbox-dot ${activeVariant.key === variant.key ? 'is-active' : ''}`}
                      onClick={() => onActiveVariantChange(family.id, variant.key)}
                      title={variant.label}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="catalogue-lightbox-collapsible">
              <div className="catalogue-lightbox-collapsible__inner">
              <CatalogueFamilyLightboxActions
                annotationsCount={annotations.length}
                canCrop={Boolean(canEdit && imageSize && !cropMode)}
                commentsCount={comments.length}
                hideCatalogueActions={showLabelTab}
                isBookmarked={Boolean(screenshot && bookmarkedIds?.has(screenshot.id))}
                onToggleBookmark={onToggleBookmark && screenshot ? () => onToggleBookmark(screenshot.id) : undefined}
                existingGroups={existingGroups}
                flowDraft={flowDraft}
                groupDraft={groupDraft}
                isInlineEditing={isInlineEditing}
                isSavingInline={isSavingInline}
                mobileOsDraft={mobileOsDraft}
                nameDraft={nameDraft}
                platformDraft={platformDraft}
                referenceLabelDraft={referenceLabelDraft}
                referenceFileName={referenceFileDraft?.name ?? null}
                hasReference={Boolean(screenshot.reference_url || screenshot.reference_storage_path)}
                themeDraft={themeDraft}
                webPresetDraft={webPresetDraft}
                webPresets={webPresets}
                onDelete={() => void requestDeleteFamily()}
                onFlowChange={setFlowDraft}
                onGroupChange={setGroupDraft}
                onMobileOsChange={setMobileOsDraft}
                onNameChange={setNameDraft}
                onOpenAnnotations={() => { setSheetMinimized(false); setLightboxPanel('annotations'); toggleAnnotationMode(); }}
                onOpenComments={() => { setSheetMinimized(false); setLightboxPanel('comments'); }}
                onOpenCrop={openCropMode}
                onPlatformChange={handleInlinePlatformChange}
                onReferenceFileSelect={handleInlineReferenceFileSelect}
                onReferenceLabelChange={setReferenceLabelDraft}
                onReupload={() => fileRef.current?.click()}
                onSave={() => void saveInlineDetails()}
                onThemeChange={setThemeDraft}
                onToggleInlineEdit={() => {
                  if (isInlineEditing) {
                    cancelInlineDetails();
                    return;
                  }
                  if (!ensureCanEdit()) return;
                  setIsInlineEditing(true);
                }}
                onWebPresetChange={setWebPresetDraft}
              />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            <div className="catalogue-family-lightbox__panel">
              <div className="catalogue-lightbox-panel-tabs" role="tablist" aria-label="Lightbox details">
                {showLabelTab ? (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={lightboxPanel === 'label'}
                      className={`catalogue-lightbox-tab ${lightboxPanel === 'label' ? 'is-active' : ''}`}
                      onClick={() => setLightboxPanel('label')}
                    >
                      Label
                    </button>
                    <button
                      type="button"
                      className={`catalogue-lightbox-copy-prompt ${promptCopied ? 'is-copied' : ''}`}
                      onClick={handleCopyPrompt}
                      title="Copy the AI labelling prompt to clipboard"
                    >
                      {promptCopied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                      {promptCopied ? 'Copied' : 'Copy Prompt'}
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              {lightboxPanel === 'label' && screenshot ? (
                <LabelEditor
                  key={screenshot.id}
                  screenshot={screenshot}
                  userEmail={userEmail}
                  onLabelPersisted={onLabelPersisted}
                />
              ) : lightboxPanel === 'comments' ? (
                <>
                  <div className="catalogue-lightbox-comments-list">
                    {loadingComments ? (
                      <div className="catalogue-lightbox-comments-empty"><div className="loading-spinner" /></div>
                    ) : commentsError ? (
                      <p className="catalogue-lightbox-comments-empty">{commentsError}</p>
                    ) : sortedComments.length === 0 ? (
                      <p className="catalogue-lightbox-comments-empty">No comments yet</p>
                    ) : (
                      sortedComments.map((comment) => (
                        <CatalogueFamilyLightboxCommentItem
                          key={comment.id}
                          comment={comment}
                          userEmail={userEmail}
                          isAdmin={isAdmin}
                          onDelete={(commentId) => void deleteComment(commentId)}
                          formatDateTime={formatDateTime}
                        />
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
                      <Send size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {annotationEditAllowed && (
                    <div className="catalogue-lightbox-annotation-toolbar">
                      <button
                        type="button"
                        className={`catalogue-lightbox-annotation-toggle ${annotationMode ? 'is-active' : ''}`}
                        onClick={toggleAnnotationMode}
                      >
                        {annotationMode ? 'Drawing mode on' : 'Add area'}
                      </button>
                      <span className="catalogue-lightbox-annotation-toolbar-copy">
                        {annotationMode ? 'Drag a box on the image, then name it.' : 'Select an area to inspect it.'}
                      </span>
                    </div>
                  )}
                  {!annotationEditAllowed && (
                    <p className="catalogue-lightbox-annotation-toolbar-copy" style={{ padding: '8px 0' }}>
                      Annotations are read-only on small screens. Open on a larger viewport to add or remove.
                    </p>
                  )}
                  {annotationError && <p className="catalogue-lightbox-annotation-error">{annotationError}</p>}
                  {annotationDraft && (
                    <div className="catalogue-lightbox-annotation-composer">
                      <div className="catalogue-lightbox-annotation-composer-label">
                        {annotationDraft.shape === 'area'
                          ? `New area at ${annotationDraft.x.toFixed(1)}%, ${annotationDraft.y.toFixed(1)}% — ${annotationDraft.width.toFixed(1)}% × ${annotationDraft.height.toFixed(1)}%`
                          : `New pin at ${annotationDraft.x.toFixed(1)}%, ${annotationDraft.y.toFixed(1)}%`}
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
                        placeholder={annotationDraft.shape === 'area' ? 'Name this area (e.g. Sign-up modal)' : 'Write annotation text...'}
                        list="catalogue-annotation-suggestions"
                        autoComplete="off"
                      />
                      {existingAnnotationLabels.length > 0 && (
                        <datalist id="catalogue-annotation-suggestions">
                          {existingAnnotationLabels.map((label) => (
                            <option key={label} value={label} />
                          ))}
                        </datalist>
                      )}
                      <div className="catalogue-lightbox-annotation-composer-actions">
                        <button
                          type="button"
                          className="catalogue-lightbox-annotation-save"
                          onClick={() => void addAnnotation()}
                          disabled={!annotationDraftText.trim()}
                        >
                          {annotationDraft.shape === 'area' ? 'Save area' : 'Save pin'}
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
                            {(isAdmin || annotation.user_email === userEmail) && (
                              <button
                                type="button"
                                className="catalogue-lightbox-annotation-delete"
                                title="Delete annotation"
                                aria-label="Delete annotation"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteAnnotation(annotation.id);
                                }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          <p className="catalogue-lightbox-annotation-text">{annotation.text}</p>
                          <span className="catalogue-lightbox-annotation-coords">
                            {annotation.shape === 'area' && annotation.width !== null && annotation.height !== null
                              ? `area · ${annotation.x.toFixed(1)}%, ${annotation.y.toFixed(1)}% — ${annotation.width.toFixed(1)}% × ${annotation.height.toFixed(1)}%`
                              : `pin · ${annotation.x.toFixed(1)}%, ${annotation.y.toFixed(1)}%`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {confirmDeleteOpen && (
      <ConfirmModal
        title="Move to Trash"
        message={`Move "${family.name}" to Trash? Recoverable for 15 days from Settings → Team → Trash.`}
        onConfirm={() => void performDeleteFamily()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    )}
    </>,
    document.body,
  );
}
