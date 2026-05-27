import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant, getVariantKey } from '../lib/catalogue-families';
import { formatDateTime, getContainLayout, type ImageSize, type LightboxAnnotation } from '../lib/catalogue-lightbox';
import { formatAbsoluteDateTime, formatRelativeTime } from '../lib/relative-time';
import { getGroupColor } from '../lib/naming';
import {
  deleteAnnotation as deleteAnnotationApi,
  fetchAnnotationsForScreenshot,
  insertAnnotation,
  type ScreenshotAnnotation,
} from '../lib/screenshot-annotations';
import { supabase } from '../lib/supabase';
import { thumbHashToPixelatedUrl } from '../lib/thumbhash';
import type { MobileOs, WebPreset } from '../types';
import { Check, Copy, Send, X } from 'lucide-react';

import { buildLightboxDraftVariant } from './CatalogueFamilyLightboxInlineEditor';
import { CatalogueFamilyLightboxActions } from './CatalogueFamilyLightboxActions';
import { CatalogueLightboxCrop } from './CatalogueLightboxCrop';
import { CatalogueFamilyLightboxCommentItem } from './CatalogueFamilyLightboxCommentItem';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { DotLoader } from './DotLoader';
import { EditableTitle } from './EditableTitle';
import { TypingKeycap, type TypingKeycapHandle } from './TypingKeycap';
import { LabelEditor } from './labeling/LabelEditor';
import { AI_LABELING_PROMPT } from '../lib/labeling/ai-prompt';
import {
  promoteAnnotationToUiElement,
  normalizeUiElementName,
} from '../lib/labeling/promote-annotation-to-ui-element';
import { UiElementComposerExtras } from './CatalogueLightboxUiElementExtras';
import { ANNOTATION_EDIT_MIN_VIEWPORT_PX, PIN_ANNOTATIONS_ENABLED } from '../lib/feature-flags';
import { ConfirmModal } from './ConfirmModal';
import { useSaveTrashAnimation } from './SaveTrashAnimation';
import { getSkipDeleteConfirm, setSkipDeleteConfirm } from '../lib/delete-confirm-pref';
interface CatalogueFamilyLightboxProps {
  activeVariantKey: string | null;
  // Optional tie-breaker: when a family has multiple variants that
  // share the same `theme:platform:preset` key (e.g., several
  // iterations of the same view), this picks the exact one we want
  // to render. Set when the lightbox is opened from a screenshot-
  // specific source like a search-result click.
  preferredScreenshotId?: string | null;
  // Non-guest gate (existing). Drives ensureCanEdit() and existing
  // permission checks for comments/annotations/etc.
  canEdit?: boolean;
  // Capability + ownership gates for the metadata-edit and delete
  // buttons in the bottom action bar. RLS already enforces; these
  // just hide affordances the caller can't act on.
  canEditMetadata?: boolean;
  canDelete?: boolean;
  existingFlows: string[];
  existingGroups: string[];
  // Existing UI Element taxonomy values (from `screen_analysis.ui_elements`
  // across all labeled screenshots). Used by the annotation composer to
  // offer autocomplete + the near-match guard when the user promotes an
  // annotation into the UI Element filter.
  existingUiElements?: string[];
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
  // Single-screenshot share — parent builds the URL + copies to
  // clipboard + shows a toast. Optional so guest contexts (or any
  // surface that wants to suppress sharing) can omit it.
  onShareLink?: (screenshotId: string) => void;
}
type ScreenshotComment = { id: string; user_email: string; text: string; created_at: string; is_public?: boolean };
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
  preferredScreenshotId = null,
  canEdit = true,
  canEditMetadata = true,
  canDelete = true,
  existingUiElements = [],
  existingFlows,
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
  onShareLink,
}: CatalogueFamilyLightboxProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const keycapRef = useRef<TypingKeycapHandle>(null);

  // Fires the typing-feedback keycap for any text input inside the
  // lightbox. EditableTitle handles its own keycap (it's used outside
  // the lightbox too) — we skip its inputs here to avoid double-press.
  function handleTypingFeedback(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('editable-title__input')) return;
    const isTextInput =
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable;
    if (!isTextInput) return;
    keycapRef.current?.press(event.key);
  }
  const { triggerSave, triggerDelete } = useSaveTrashAnimation();
  // When the delete animation is choreographing, hide the lightbox
  // media area so the ghost overlay doesn't double with the live image.
  const [isAnimatingDelete, setIsAnimatingDelete] = useState(false);

  // Save flow — floppy slides in from left of the lightbox image,
  // screenshot crumples into it. Mutation commits mid-flight so the
  // bookmarked state flips before the floppy exits.
  function fireSaveAnimation() {
    if (!screenshot || !onToggleBookmark) return;
    const rect = mediaRef.current?.getBoundingClientRect();
    if (!rect) {
      onToggleBookmark(screenshot.id);
      return;
    }
    triggerSave({
      sourceRect: rect,
      screenshotUrl: screenshot.image_url ?? null,
      thumbHash: screenshot.thumb_hash ?? null,
      onComplete: () => onToggleBookmark(screenshot.id),
    });
  }

  // Delete flow — screenshot crumples, trash slides in from right,
  // ball arcs into it. onComplete fires the actual soft-delete so the
  // family drops from the grid right as the ball lands.
  function fireDeleteAnimation() {
    if (!screenshot) return;
    const rect = mediaRef.current?.getBoundingClientRect();
    if (!rect) {
      void onDeleteFamily(family.id);
      return;
    }
    setIsAnimatingDelete(true);
    triggerDelete({
      sourceRect: rect,
      screenshotUrl: screenshot.image_url ?? null,
      thumbHash: screenshot.thumb_hash ?? null,
      onComplete: () => {
        void onDeleteFamily(family.id);
      },
    });
  }
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
  // "Tag as UI Element" toggle — promotes the annotation's label into the
  // screenshot's `screen_analysis.ui_elements` array on save, so it becomes
  // filterable. Only available on area annotations (pins represent a single
  // location, not a UI element you'd filter by).
  const [tagAsUiElement, setTagAsUiElement] = useState(false);
  // UI Elements promoted in this lightbox session — overlays the
  // `existingUiElements` prop so the UI badge reflects the just-saved
  // value without waiting for a catalogue refetch.
  const [sessionUiElements, setSessionUiElements] = useState<string[]>([]);
  const [annotationEditAllowed, setAnnotationEditAllowed] = useState<boolean>(() => isAnnotationEditAllowedNow());
  const [imageSize, setImageSize] = useState<ImageSize | null>(null); const [mediaSize, setMediaSize] = useState<ImageSize | null>(null);
  // Tracks whether the full image has finished loading so we can
  // fade it in over the thumb-hash placeholder. Reset on each
  // screenshot change in the same effect that resets imageSize.
  const [imageLoaded, setImageLoaded] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [comments],
  );
  const activeVariant = useMemo(
    () => getActiveFamilyVariant(family, activeVariantKey, preferredScreenshotId),
    [activeVariantKey, family, preferredScreenshotId],
  ); const screenshot = activeVariant?.screenshot ?? null;
  const mediaLayout = useMemo(() => getContainLayout(mediaSize, imageSize), [imageSize, mediaSize]);
  const groupColor = getGroupColor(family.group);
  // Existing UI Elements (from the studio-curated taxonomy) merged with
  // any promoted in this lightbox session. Used by autocomplete + the
  // near-match guard + the "UI" badge on annotations.
  const combinedUiElements = useMemo(() => {
    if (sessionUiElements.length === 0) return existingUiElements;
    const seen = new Set(existingUiElements.map((value) => value.toLowerCase()));
    const merged = [...existingUiElements];
    for (const value of sessionUiElements) {
      if (!seen.has(value.toLowerCase())) {
        merged.push(value);
        seen.add(value.toLowerCase());
      }
    }
    return merged;
  }, [existingUiElements, sessionUiElements]);
  // Annotation labels that match a known UI Element (case-insensitive)
  // get the green "UI" badge on the canvas. Set lookup is O(1) per
  // annotation in the render loop.
  const uiElementLookup = useMemo(
    () => new Set(combinedUiElements.map((value) => value.toLowerCase())),
    [combinedUiElements],
  );

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
    setSessionUiElements([]);
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
  // Reset imageLoaded only when the image URL actually changes — NOT
  // when the screenshot reference changes due to a metadata edit
  // (name / flow / group / etc). With the previous broader dependency
  // on `screenshot`, editing details flipped imageLoaded to false but
  // the cached <img src=…> never re-fired its onLoad, so the image
  // stayed at opacity 0 → black media area until the user navigated
  // to a different screenshot.
  useEffect(() => {
    setImageLoaded(false);
  }, [screenshot?.image_url]);
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
  // Reset the "Tag as UI Element" toggle whenever the draft closes
  // (save, cancel, escape, or screenshot change). Avoids state bleed
  // when the user opens a fresh annotation on the same screenshot.
  useEffect(() => {
    if (!annotationDraft) {
      setTagAsUiElement(false);
    }
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
      // Block lightbox prev/next while in crop — left/right belong to
      // the crop handles' own keyboard nudging in this mode.
      if (cropMode) return;
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
  }, [isOpen, onPrev, onNext, annotationMode, annotationDraft, confirmDeleteOpen, cropMode]);
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

  // ESC closes the lightbox when nothing else needs the key first.
  // Order of precedence:
  //   1. typing in an input / textarea / contentEditable — let the
  //      field handle it (no close)
  //   2. confirm modal open — its own ESC handler runs
  //   3. crop mode — has its own escape path (Cancel button)
  //   4. an annotation is selected — the effect above clears it
  //   5. otherwise → close the lightbox
  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (confirmDeleteOpen || cropMode || selectedAnnotationId) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, confirmDeleteOpen, cropMode, selectedAnnotationId]);
  // Single-letter lightbox shortcuts. Letter → action mapping mirrors
  // the icon-bar buttons; each shortcut respects the same permission
  // gates the corresponding button does. Skip everything when the
  // user is typing in a field or holding a modifier key.
  //
  // Common-block modes (block ALL shortcuts): inline-editing, crop
  // mode, delete-confirm dialog open — those own the keyboard.
  // Annotation mode blocks E/D (matches the prior behaviour) but
  // lets A through so the user can toggle annotation off via 'A'.
  useEffect(() => {
    if (!isOpen) return;
    function handleShortcut(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (isInlineEditing || confirmDeleteOpen || cropMode) return;
      const key = event.key.toLowerCase();
      if (key === 'a') {
        // Annotation toggle — even if a draft is mid-flight, A still
        // toggles (matches what clicking the annotation button does).
        event.preventDefault();
        setSheetMinimized(false);
        setLightboxPanel('annotations');
        toggleAnnotationMode();
        return;
      }
      if (key === 'b') {
        if (!onToggleBookmark || !screenshot) return;
        event.preventDefault();
        const isBookmarked = bookmarkedIds?.has(screenshot.id) ?? false;
        if (isBookmarked) {
          onToggleBookmark(screenshot.id);
        } else {
          fireSaveAnimation();
        }
        return;
      }
      if (key === 'c') {
        // openCropMode internally resets annotation state if needed.
        if (!canEdit || !screenshot || !imageSize) return;
        event.preventDefault();
        openCropMode();
        return;
      }
      // E and D require no other-mode interference.
      if (annotationMode || annotationDraft) return;
      if (key === 'e') {
        if (!canEdit) return;
        event.preventDefault();
        setIsInlineEditing(true);
      } else if (key === 'd') {
        if (!canDelete) return;
        event.preventDefault();
        requestDeleteFamily();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isOpen, canEdit, canDelete, isInlineEditing, annotationMode, annotationDraft, confirmDeleteOpen, cropMode, onToggleBookmark, screenshot, imageSize]);
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
  const toggleCommentPublic = useCallback(async (commentId: string, nextIsPublic: boolean) => {
    if (!ensureCanEdit()) return;
    // Optimistic flip — UI updates immediately, revert on error.
    setComments((previous) => previous.map((comment) =>
      comment.id === commentId ? { ...comment, is_public: nextIsPublic } : comment
    ));
    const { error } = await supabase
      .from('screenshot_comments')
      .update({ is_public: nextIsPublic })
      .eq('id', commentId);
    if (error) {
      setComments((previous) => previous.map((comment) =>
        comment.id === commentId ? { ...comment, is_public: !nextIsPublic } : comment
      ));
      setCommentsError('Unable to update share visibility.');
    }
  }, [canEdit, onRequireAuth]);
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
    // After a horizontal swipe, iOS fires a synthetic click on touchend.
    // Suppress it so the user doesn't accidentally deselect an annotation
    // (or trigger any future click-based behaviour) right after navigating.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (annotationMode || drawing || annotationDraft) return;
    if (!selectedAnnotationId) return;
    setSelectedAnnotationId(null);
  }

  // ── Mobile swipe gestures on the media (prev / next) ──
  // Tracked via a ref so the gesture doesn't trigger re-renders. The
  // axis is decided after a short threshold of movement (10px), and
  // we only navigate when the user crossed SWIPE_DISTANCE_PX
  // horizontally within SWIPE_MAX_DURATION_MS. Disabled while crop or
  // annotation tools are active so we don't fight their own pointer
  // logic.
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    active: boolean;
    isHorizontal: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const SWIPE_DISTANCE_PX = 60;
  const SWIPE_MAX_DURATION_MS = 800;
  const SWIPE_AXIS_LOCK_PX = 10;

  function swipeEnabled() {
    return !cropMode && !annotationMode && !drawing && !annotationDraft;
  }

  function handleMediaTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (!swipeEnabled()) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    swipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: performance.now(),
      active: true,
      isHorizontal: false,
    };
  }

  function handleMediaTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const state = swipeRef.current;
    if (!state?.active) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (!state.isHorizontal && absDx > SWIPE_AXIS_LOCK_PX && absDx > absDy * 1.5) {
      state.isHorizontal = true;
    } else if (!state.isHorizontal && absDy > SWIPE_AXIS_LOCK_PX && absDy > absDx * 1.5) {
      // Dominant vertical — abandon the swipe so the page can scroll
      // (the lightbox's comments panel scrolls vertically).
      state.active = false;
    }
  }

  function handleMediaTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const state = swipeRef.current;
    swipeRef.current = null;
    if (!state?.active || !state.isHorizontal) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - state.startX;
    const elapsed = performance.now() - state.startTime;
    if (Math.abs(dx) < SWIPE_DISTANCE_PX) return;
    if (elapsed > SWIPE_MAX_DURATION_MS) return;
    // Left swipe (dx < 0) advances; right swipe (dx > 0) goes back.
    if (dx < 0 && onNext) {
      suppressNextClickRef.current = true;
      onNext();
    } else if (dx > 0 && onPrev) {
      suppressNextClickRef.current = true;
      onPrev();
    }
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
    // Second write — promote the annotation label into the screenshot's
    // ui_elements list. Best-effort; annotation row is already saved if
    // we got here. Failure surfaces as a non-blocking notice but doesn't
    // roll back the annotation.
    if (tagAsUiElement && annotationDraft.shape === 'area') {
      const canonical = normalizeUiElementName(trimmed);
      const result = await promoteAnnotationToUiElement(screenshot, canonical, userEmail || null);
      if (result.ok) {
        setSessionUiElements((current) => (
          current.some((value) => value.toLowerCase() === canonical.toLowerCase())
            ? current
            : [...current, canonical]
        ));
      } else {
        setAnnotationError('Annotation saved, but tagging it as a UI Element failed. Try again from the Studio.');
      }
    }
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
    // Skip the confirm modal if the user previously ticked "Don't
    // show again". Go straight to the trash animation.
    if (getSkipDeleteConfirm()) {
      fireDeleteAnimation();
      return;
    }
    setConfirmDeleteOpen(true);
  }
  function performDeleteFamily(options?: { dontShowAgain: boolean }) {
    if (options?.dontShowAgain) setSkipDeleteConfirm(true);
    setConfirmDeleteOpen(false);
    fireDeleteAnimation();
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
      setImageLoaded(false);
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
    <div className="catalogue-lightbox" onClick={onClose} onKeyDownCapture={handleTypingFeedback}>
      <TypingKeycap ref={keycapRef} />
      <div className="catalogue-lightbox-header" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-name-wrap">
          <EditableTitle
            as="span"
            className="catalogue-lightbox-name"
            value={family.name}
            canEdit={canEditMetadata}
            onSave={(next) => onRenameFamily(family.id, next)}
          />
        </div>
        {family.group && <span className="catalogue-lightbox-group" style={{ borderColor: groupColor, color: groupColor }}><CatalogueGroupLabel group={family.group} projectId={null} linkTo={`/g/${encodeURIComponent(family.group.trim().toLowerCase())}`} /></span>}
        {screenshot.platform && <span className="catalogue-lightbox-tag">{screenshot.platform}</span>}
        {screenshot.theme && <span className="catalogue-lightbox-tag">{screenshot.theme}</span>}
        <button type="button" className="catalogue-lightbox-close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="catalogue-lightbox-body" onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-media">
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
          <div
            className={`catalogue-lightbox-media-inner${isAnimatingDelete ? ' is-animating-delete' : ''}`}
            ref={mediaRef}
            onMouseDown={handleMediaMouseDown}
            onMouseMove={handleMediaMouseMove}
            onMouseUp={handleMediaMouseUp}
            onMouseLeave={handleMediaMouseLeave}
            onClick={handleMediaClick}
            onTouchStart={handleMediaTouchStart}
            onTouchMove={handleMediaTouchMove}
            onTouchEnd={handleMediaTouchEnd}
            style={{ cursor: annotationMode && annotationEditAllowed ? 'crosshair' : 'default' }}
          >
          {/* Thumb-hash blurhash placeholder — paints instantly so the
              lightbox doesn't show a blank media area while the full
              image downloads. Mirrors the grid card's ThumbHashImage
              behaviour without restructuring the lightbox's pin-overlay
              coordinate system. */}
          {(() => {
            const hash = activeVariant?.screenshot?.thumb_hash;
            if (!hash || imageLoaded) return null;
            let url: string | null = null;
            try { url = thumbHashToPixelatedUrl(hash); } catch { url = null; }
            if (!url) return null;
            return (
              <img
                src={url}
                alt=""
                aria-hidden
                draggable={false}
                className="catalogue-lightbox-img-placeholder"
              />
            );
          })()}
          <img
            src={screenshot.image_url}
            alt={`${family.name} ${activeVariant.label}`}
            className="catalogue-lightbox-img"
            style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 0.2s ease-in' }}
            onLoad={(event) => {
              setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              setImageLoaded(true);
            }}
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
                    <span className="catalogue-lightbox-area-label">
                      {index + 1} · {annotation.text}
                      {uiElementLookup.has(annotation.text.toLowerCase()) && (
                        <span className="catalogue-lightbox-area-label__ui-badge">UI</span>
                      )}
                    </span>
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
              <DotLoader size="lg" ariaLabel="Loading next" />
              <span>Loading next…</span>
            </div>
          )}
          </div>
          )}
        </div>
        <div className={`catalogue-lightbox-comments ${sheetMinimized ? 'is-minimized' : ''}`}>
          <button type="button" className="catalogue-lightbox-grabber" onClick={() => setSheetMinimized((v) => !v)} aria-label={sheetMinimized ? 'Expand panel' : 'Minimize panel'} />
          <div className="catalogue-family-lightbox">
            <div className="catalogue-family-lightbox__summary">
              <div className="catalogue-lightbox-meta-line">
                {family.group && <span className="catalogue-lightbox-meta-chip" style={{ borderColor: groupColor, color: groupColor }}><CatalogueGroupLabel group={family.group} projectId={null} linkTo={`/g/${encodeURIComponent(family.group.trim().toLowerCase())}`} /></span>}
                {flowName && <><span className="catalogue-lightbox-meta-sep">·</span><span className="catalogue-lightbox-meta-chip catalogue-lightbox-meta-chip--flow">{flowName}</span></>}
                {activeVariant.label && <><span className="catalogue-lightbox-meta-sep">·</span><span className="catalogue-lightbox-meta-chip catalogue-lightbox-meta-chip--variant">{activeVariant.label}</span></>}
                {(activeVariant.screenshot?.created_at || family.created_at) && (() => {
                  const raw = activeVariant.screenshot?.created_at || family.created_at;
                  const date = raw ? new Date(raw) : null;
                  if (!date || Number.isNaN(date.getTime())) return null;
                  return (
                    <>
                      <span className="catalogue-lightbox-meta-sep">·</span>
                      <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <time
                              className="catalogue-lightbox-meta-time"
                              dateTime={date.toISOString()}
                            >
                              {formatRelativeTime(date)}
                            </time>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="catalogue-meta-tooltip"
                              sideOffset={6}
                              collisionPadding={8}
                            >
                              {formatAbsoluteDateTime(date)}
                              <Tooltip.Arrow className="catalogue-meta-tooltip__arrow" width={8} height={4} />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    </>
                  );
                })()}
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
                onToggleBookmark={onToggleBookmark && screenshot ? () => {
                  // Already saved → instant unsave, no animation.
                  if (bookmarkedIds?.has(screenshot.id)) {
                    onToggleBookmark(screenshot.id);
                  } else {
                    fireSaveAnimation();
                  }
                } : undefined}
                onShareLink={onShareLink && screenshot ? () => onShareLink(screenshot.id) : undefined}
                existingFlows={existingFlows}
                existingGroups={existingGroups}
                flowDraft={flowDraft}
                groupDraft={groupDraft}
                suggestedGroup={screenshot?.suggested_group ?? null}
                canEdit={canEditMetadata}
                canDelete={canDelete}
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
                      <div className="catalogue-lightbox-comments-empty"><DotLoader size="md" ariaLabel="Loading comments" /></div>
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
                          onToggleIsPublic={(commentId, nextIsPublic) => void toggleCommentPublic(commentId, nextIsPublic)}
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
                    <form
                      className="catalogue-lightbox-annotation-composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addAnnotation();
                      }}
                    >
                      <input
                        ref={annotationInputRef}
                        type="text"
                        value={annotationDraftText}
                        onChange={(event) => setAnnotationDraftText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setAnnotationDraft(null);
                            setAnnotationDraftText('');
                          }
                        }}
                        placeholder={annotationDraft.shape === 'area' ? 'Name this area (e.g. Sign-up modal)' : 'Write annotation text...'}
                        autoComplete="off"
                      />
                      {annotationDraft.shape === 'area' && (
                        <UiElementComposerExtras
                          tagAsUiElement={tagAsUiElement}
                          onToggle={() => setTagAsUiElement((current) => !current)}
                          draftText={annotationDraftText}
                        />
                      )}
                      <div className="catalogue-lightbox-annotation-composer-actions">
                        <button
                          type="submit"
                          className="catalogue-lightbox-annotation-save"
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
                    </form>
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
                            {annotation.shape === 'area' && uiElementLookup.has(annotation.text.toLowerCase()) && (
                              <span
                                className="catalogue-lightbox-annotation-ui-badge"
                                title="This annotation is also a UI Element"
                              >
                                UI
                              </span>
                            )}
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
        confirmLabel="Move to Trash"
        dontShowAgainLabel="Don't show this confirmation again"
        onConfirm={(options) => performDeleteFamily(options)}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    )}
    </>,
    document.body,
  );
}
