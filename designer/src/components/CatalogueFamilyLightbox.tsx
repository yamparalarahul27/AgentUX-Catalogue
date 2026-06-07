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
  updateAnnotationGeometry,
  type ScreenshotAnnotation,
} from '../lib/screenshot-annotations';
import { enqueueMutation } from '../lib/mutation-queue';
import { supabase } from '../lib/supabase';
import { thumbHashToPixelatedUrl } from '../lib/thumbhash';
import type { MobileOs, WebPreset } from '../types';
import { Check, ChevronUp, Copy, Crop, Save, Send, Trash2, X } from 'lucide-react';

import { AnnotationResizeHandles } from './AnnotationResizeHandles';
import { buildLightboxDraftVariant } from './CatalogueFamilyLightboxInlineEditor';
import { CatalogueFamilyLightboxActions } from './CatalogueFamilyLightboxActions';
import { CatalogueLightboxCrop } from './CatalogueLightboxCrop';
import { Squircle } from './Squircle';
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
import { saveLabel as saveLabelToDb } from '../lib/labeling/save-label';
import type { ScreenshotLabel, UiElementAnchor } from '../lib/labeling/types';
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
  // Optional toast surface — used by the mobile mini action bar so
  // every tap gets visible confirmation. Caller wires to the same
  // `setToast` that the rest of the page uses.
  onToast?: (message: string, type?: 'info' | 'success' | 'error') => void;
}
type ScreenshotComment = { id: string; user_email: string; text: string; created_at: string; is_public?: boolean };
type LightboxPanel = 'label' | 'comments' | 'annotations' | 'ui-elements';
type AnnotationDraft = { shape: 'pin' | 'area'; x: number; y: number; width: number; height: number };
type DrawingState = { startX: number; startY: number; currentX: number; currentY: number };

const DRAG_THRESHOLD_PERCENT = 0.8; // ~0.8% of image dimension counts as a drag (otherwise: click)

type SheetState = 'min' | 'full';
const shouldStartLightboxSheetMinimized = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
const initialSheetState = (): SheetState => (shouldStartLightboxSheetMinimized() ? 'min' : 'full');
// Tap toggles between minimized (just grabber + action icons) and the
// near-fullscreen panel that hosts metadata + tabs + comments +
// annotations. No intermediate mid state — felt fiddly on mobile.
const nextSheetState = (current: SheetState): SheetState => (
  current === 'min' ? 'full' : 'min'
);
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
  onToast,
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
  const [sheetState, setSheetState] = useState<SheetState>(initialSheetState);
  const sheetMinimized = sheetState === 'min';
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
  // AI-suggested anchor names the user dismissed in this session. The
  // dismissAnchor handler persists removal to the DB via saveLabel +
  // onLabelPersisted, but we also keep a session-local set so the ghost
  // disappears immediately (the parent's screenshot prop only updates
  // after onLabelPersisted propagates). Cleared on screenshot change.
  const [dismissedAnchorNames, setDismissedAnchorNames] = useState<Set<string>>(new Set());
  // When the user clicks an AI ghost to edit/accept it, we mark the
  // anchor name here so the existing saveAnnotation handler knows
  // "this draft promotes an AI anchor — confidence should land as 1.0,
  // not append a duplicate name."
  const [promotingAnchorName, setPromotingAnchorName] = useState<string | null>(null);
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

  // Annotations that are also in the UI Element taxonomy. These are
  // the ones that surface in the UI Elements tab — filtered subset of
  // the full annotation list, area shape only (pins don't represent
  // a region with a name).
  const uiElementAnnotations = useMemo(
    () => annotations.filter((annotation) => (
      annotation.shape === 'area' && uiElementLookup.has(annotation.text.toLowerCase())
    )),
    [annotations, uiElementLookup],
  );

  // AI-suggested anchors that haven't yet been accepted (no matching
  // annotation row by name) AND haven't been dismissed in this session.
  // These render as dashed indigo "ghost" rectangles on the screenshot
  // and as rows in the right-panel AI suggestions section. Bbox-less
  // anchors are skipped — the AI couldn't locate them, so there's
  // nothing to render.
  const pendingAnchors = useMemo<UiElementAnchor[]>(() => {
    const raw = (screenshot?.metadata as Record<string, unknown> | null)?.label as ScreenshotLabel | undefined;
    const anchors = raw?.screen_analysis?.ui_element_anchors ?? [];
    const promotedNames = new Set(
      annotations
        .filter((a) => a.shape === 'area')
        .map((a) => a.text.toLowerCase()),
    );
    return anchors.filter((anchor) => {
      if (!anchor.bbox) return false;
      const lower = anchor.name.toLowerCase();
      if (promotedNames.has(lower)) return false;
      if (dismissedAnchorNames.has(lower)) return false;
      return true;
    });
  }, [annotations, dismissedAnchorNames, screenshot]);

  function ensureCanEdit() { if (canEdit) return true; onRequireAuth?.(); return false; }

  // Load an AI-suggested anchor into the existing annotation draft
  // editor. Reuses the manual-draw / save-area flow — user can drag
  // corners to refine before clicking "Save area," and on save the
  // annotation row + ui_element_anchors entry are both written via the
  // existing saveAnnotation handler (with tagAsUiElement: true).
  const acceptAnchor = useCallback((anchor: UiElementAnchor) => {
    if (!ensureCanEdit()) return;
    if (!anchor.bbox) return;
    const [x, y, w, h] = anchor.bbox;
    setAnnotationMode(true);
    setAnnotationDraft({ shape: 'area', x, y, width: w, height: h });
    setAnnotationDraftText(anchor.name);
    setTagAsUiElement(true);
    setAnnotationError('');
    setPromotingAnchorName(anchor.name);
  }, [canEdit, onRequireAuth]);

  // Remove an anchor from the label without creating an annotation
  // row. Optimistic local-state update + persisted via saveLabel +
  // onLabelPersisted so the parent's screenshot prop refreshes.
  const dismissAnchor = useCallback(async (anchor: UiElementAnchor) => {
    if (!ensureCanEdit() || !screenshot) return;
    const lower = anchor.name.toLowerCase();
    // Optimistic local hide.
    setDismissedAnchorNames((prev) => {
      if (prev.has(lower)) return prev;
      const next = new Set(prev);
      next.add(lower);
      return next;
    });
    const raw = (screenshot.metadata as Record<string, unknown> | null)?.label as ScreenshotLabel | undefined;
    if (!raw) return;
    const nextLabel: ScreenshotLabel = {
      ...raw,
      screen_analysis: {
        ...raw.screen_analysis,
        ui_element_anchors: (raw.screen_analysis?.ui_element_anchors ?? []).filter(
          (entry) => entry.name.toLowerCase() !== lower,
        ),
      },
    };
    const result = await saveLabelToDb(screenshot.id, nextLabel);
    if (result.ok) {
      onLabelPersisted?.(screenshot.id, nextLabel);
    } else {
      // Roll back the optimistic dismissal on failure.
      setDismissedAnchorNames((prev) => {
        const next = new Set(prev);
        next.delete(lower);
        return next;
      });
      setAnnotationError('Could not dismiss the suggestion right now.');
    }
  }, [canEdit, onLabelPersisted, onRequireAuth, screenshot]);

  // "Dismiss all" — bulk-remove every pending anchor from the label.
  // Same persistence path as dismissAnchor, batched.
  const dismissAllAnchors = useCallback(async () => {
    if (!ensureCanEdit() || !screenshot || pendingAnchors.length === 0) return;
    const names = pendingAnchors.map((a) => a.name.toLowerCase());
    // Optimistic.
    setDismissedAnchorNames((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      return next;
    });
    const raw = (screenshot.metadata as Record<string, unknown> | null)?.label as ScreenshotLabel | undefined;
    if (!raw) return;
    const nameSet = new Set(names);
    const nextLabel: ScreenshotLabel = {
      ...raw,
      screen_analysis: {
        ...raw.screen_analysis,
        ui_element_anchors: (raw.screen_analysis?.ui_element_anchors ?? []).filter(
          (entry) => !nameSet.has(entry.name.toLowerCase()),
        ),
      },
    };
    const result = await saveLabelToDb(screenshot.id, nextLabel);
    if (result.ok) {
      onLabelPersisted?.(screenshot.id, nextLabel);
    } else {
      // Roll back.
      setDismissedAnchorNames((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
      setAnnotationError('Could not dismiss the suggestions right now.');
    }
  }, [canEdit, onLabelPersisted, onRequireAuth, pendingAnchors, screenshot]);

  useEffect(() => {
    if (!isOpen || !screenshot) return;
    setLightboxPanel(showLabelTab ? 'label' : 'comments');
    setSheetState(initialSheetState());
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
    setDismissedAnchorNames(new Set());
    setPromotingAnchorName(null);
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
          // Don't wipe local state — if the user added an optimistic
          // comment while offline, the previous list (containing that
          // optimistic entry) should remain visible. setting to []
          // here would silently erase the user's work.
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
        setSheetState((current) => (current === 'min' ? 'full' : current));
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
    // Client-generated UUID — used as the row's primary key so the
    // optimistic local entry matches the eventually-persisted server row.
    // Subsequent deletes / edits target this id without needing a
    // post-insert reconciliation.
    const clientId = crypto.randomUUID();
    const optimisticComment: ScreenshotComment = {
      id: clientId,
      user_email: userEmail,
      text: trimmed,
      created_at: new Date().toISOString(),
    };
    // Optimistic: push immediately, clear input, bump counter.
    setComments((previous) => [...previous, optimisticComment]);
    setNewComment('');
    setCommentsError('');
    onCommentCountChange?.(screenshot.id, 1);
    // Durable replay via the mutation queue — drains immediately when
    // online, persists across reloads when offline.
    await enqueueMutation({
      op: 'add-comment',
      screenshotId: screenshot.id,
      text: trimmed,
      userEmail,
      clientId,
    });
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
    // Clear the AI-anchor promotion flag if this draft originated
    // from a ghost click. The ghost render filter will hide this
    // anchor on next render since `annotations` now contains a
    // matching-name row.
    if (promotingAnchorName) setPromotingAnchorName(null);
    // Second write — promote the annotation label into the screenshot's
    // ui_elements list. Best-effort; annotation row is already saved if
    // we got here. Failure surfaces as a non-blocking notice but doesn't
    // roll back the annotation.
    if (tagAsUiElement && annotationDraft.shape === 'area') {
      const canonical = normalizeUiElementName(trimmed);
      // Pass the area's bbox through so the label's ui_element_anchors
      // stays in sync with the annotations table. Coordinates are
      // already in 0-100 percent (annotationDraft.{x,y,width,height}).
      const bbox: [number, number, number, number] = [
        annotationDraft.x,
        annotationDraft.y,
        annotationDraft.width,
        annotationDraft.height,
      ];
      const result = await promoteAnnotationToUiElement(screenshot, canonical, userEmail || null, { bbox });
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
  // Local-then-remote resize. The handles call onResize on every
  // pointermove (live) — we just patch the in-memory annotations
  // array so the frame redraws. onResizeEnd fires once on pointerup
  // with the final bbox, where we hit the DB. Failure rolls the
  // annotation back to its previous geometry.
  function applyLocalAnnotationResize(annotationId: string, next: { x: number; y: number; width: number; height: number }) {
    setAnnotations((current) => current.map((annotation) => (
      annotation.id === annotationId
        ? { ...annotation, x: next.x, y: next.y, width: next.width, height: next.height }
        : annotation
    )));
  }
  async function commitAnnotationResize(annotationId: string, final: { x: number; y: number; width: number; height: number }) {
    if (!ensureCanEdit() || !screenshot) return;
    const ok = await updateAnnotationGeometry(annotationId, {
      x: final.x,
      y: final.y,
      width: final.width,
      height: final.height,
    });
    if (!ok) {
      setAnnotationError('Could not save the new size. Reverting.');
      // Refetch to roll back. Cheap — annotations are tiny rows.
      const rows = await fetchAnnotationsForScreenshot(screenshot.id);
      setAnnotations(rows.map(toLightboxAnnotation));
      return;
    }
    // Dual-write to ui_element_anchors if this annotation's text is in
    // the UI Element taxonomy — keeps Cropped view / Elements browse
    // showing the LATEST bbox, not the stale one written at creation.
    const annotation = annotations.find((a) => a.id === annotationId);
    if (annotation && uiElementLookup.has(annotation.text.toLowerCase())) {
      const canonical = normalizeUiElementName(annotation.text);
      void promoteAnnotationToUiElement(screenshot, canonical, userEmail || null, {
        bbox: [final.x, final.y, final.width, final.height],
      });
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
        <Squircle as="button" cornerRadius={12} type="button" className="catalogue-lightbox-close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Squircle>
      </div>
      <div className={`catalogue-lightbox-body${cropMode ? ' is-crop' : ''}`} onClick={(event) => event.stopPropagation()}>
        <div className="catalogue-lightbox-media">
          {/* Desktop-only close button overlaid on the screenshot (top-left).
              Hidden on mobile via CSS — mobile keeps the close in the header. */}
          <Squircle
            as="button"
            cornerRadius={10}
            type="button"
            className="catalogue-lightbox-media-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </Squircle>
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
              {/* Annotations on the canvas are tab-scoped: Comments &
                * Label show a clean screenshot, Annotations shows
                * everything, UI Elements shows just the taxonomy
                * subset. Outside those tabs the overlay is hidden.
                * Drafts + drawing always render regardless of tab —
                * those are active interaction state. */}
              {(lightboxPanel === 'annotations' || lightboxPanel === 'ui-elements')
                ? (lightboxPanel === 'ui-elements' ? uiElementAnnotations : annotations).map((annotation, index) => (
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
              )) : null}
              {/* Resize handles for the SELECTED saved annotation —
                * 8 grab points around the bbox. Hidden while drawing
                * a new annotation or composing a draft so layers
                * don't collide. Only area annotations (width/height
                * non-null) can be resized; pins are points, nothing
                * to resize. */}
              {(lightboxPanel === 'annotations' || lightboxPanel === 'ui-elements')
                && selectedAnnotationId && !drawing && !annotationDraft && canEdit && (() => {
                const selected = annotations.find((a) => a.id === selectedAnnotationId);
                if (!selected || selected.shape !== 'area' || selected.width === null || selected.height === null) return null;
                const selectedId = selected.id;
                return (
                  <AnnotationResizeHandles
                    bbox={{ x: selected.x, y: selected.y, width: selected.width, height: selected.height }}
                    mediaLayout={mediaLayout}
                    onResize={(next) => applyLocalAnnotationResize(selectedId, next)}
                    onResizeEnd={(final) => { void commitAnnotationResize(selectedId, final); }}
                  />
                );
              })()}
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
                <>
                  <div
                    className="catalogue-lightbox-area catalogue-lightbox-area--draft is-active"
                    style={{
                      left: `${mediaLayout.left + (annotationDraft.x / 100) * mediaLayout.width}px`,
                      top: `${mediaLayout.top + (annotationDraft.y / 100) * mediaLayout.height}px`,
                      width: `${(annotationDraft.width / 100) * mediaLayout.width}px`,
                      height: `${(annotationDraft.height / 100) * mediaLayout.height}px`,
                    }}
                  />
                  <AnnotationResizeHandles
                    bbox={{
                      x: annotationDraft.x,
                      y: annotationDraft.y,
                      width: annotationDraft.width,
                      height: annotationDraft.height,
                    }}
                    mediaLayout={mediaLayout}
                    onResize={(next) => setAnnotationDraft({ shape: 'area', x: next.x, y: next.y, width: next.width, height: next.height })}
                  />
                </>
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
              {/* AI ghost overlay — dashed indigo bboxes for pending
                * suggestions. Only visible when the user is on the
                * Annotations tab (otherwise the ghosts compete with
                * the Comments / Label workflows visually). Hidden
                * while drawing or while a draft is being edited so
                * the layers don't collide. */}
              {lightboxPanel === 'annotations' && !drawing && !annotationDraft && pendingAnchors.map((anchor) => {
                const [ax, ay, aw, ah] = anchor.bbox!;
                return (
                  <button
                    key={`ghost:${anchor.name}`}
                    type="button"
                    className="catalogue-lightbox-ghost"
                    style={{
                      left: `${mediaLayout.left + (ax / 100) * mediaLayout.width}px`,
                      top: `${mediaLayout.top + (ay / 100) * mediaLayout.height}px`,
                      width: `${(aw / 100) * mediaLayout.width}px`,
                      height: `${(ah / 100) * mediaLayout.height}px`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      acceptAnchor(anchor);
                    }}
                    title={`AI suggestion: ${anchor.name} (click to refine & accept)`}
                  >
                    <span className="catalogue-lightbox-ghost-label">
                      {anchor.name}
                      {anchor.confidence !== null && (
                        <span className="catalogue-lightbox-ghost-confidence">
                          {Math.round(anchor.confidence * 100)}%
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
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
        <div className={`catalogue-lightbox-comments is-${sheetState}${sheetState === 'min' ? ' is-minimized' : ''}`}>
          <button
            type="button"
            className="catalogue-lightbox-grabber"
            onClick={() => setSheetState(nextSheetState)}
            aria-label={sheetState === 'min' ? 'Expand panel' : 'Minimize panel'}
          >
            <ChevronUp size={20} aria-hidden="true" />
          </button>
          {/* Mobile-only mini action bar visible when the sheet is
              minimized. The metadata strip used to live in this slot
              but didn't enable any action — actions belong in the
              thumb zone, metadata + tabs surface when the user
              expands the sheet. */}
          <div className="catalogue-lightbox-mini-actions" aria-hidden={!sheetMinimized}>
            {/* Destructive / edit cluster on the left. */}
            {canDelete && (
              <Squircle
                as="button"
                cornerRadius={16}
                type="button"
                className="catalogue-lightbox-mini-actions__btn catalogue-lightbox-mini-actions__btn--danger"
                onClick={() => void requestDeleteFamily()}
                title="Delete"
                aria-label="Delete"
              >
                <Trash2 size={20} aria-hidden="true" />
              </Squircle>
            )}
            {canEdit && imageSize && (
              <Squircle
                as="button"
                cornerRadius={16}
                type="button"
                className="catalogue-lightbox-mini-actions__btn"
                onClick={() => {
                  openCropMode();
                  onToast?.('Crop mode', 'info');
                }}
                title="Crop"
                aria-label="Crop"
              >
                <Crop size={20} aria-hidden="true" />
              </Squircle>
            )}
            {/* Spacer separates destructive cluster from save/share. */}
            <span className="catalogue-lightbox-mini-actions__spacer" />
            {/* Save / share cluster on the right. */}
            {onToggleBookmark && screenshot && (
              <Squircle
                as="button"
                cornerRadius={16}
                type="button"
                className={`catalogue-lightbox-mini-actions__btn${bookmarkedIds?.has(screenshot.id) ? ' is-active' : ''}`}
                onClick={() => {
                  const wasSaved = Boolean(bookmarkedIds?.has(screenshot.id));
                  if (wasSaved) {
                    onToggleBookmark(screenshot.id);
                  } else {
                    fireSaveAnimation();
                  }
                  onToast?.(wasSaved ? 'Removed from Saved' : 'Saved', 'success');
                }}
                title={bookmarkedIds?.has(screenshot.id) ? 'Unsave' : 'Save'}
                aria-label="Save"
                aria-pressed={Boolean(bookmarkedIds?.has(screenshot.id))}
              >
                <Save size={20} aria-hidden="true" />
              </Squircle>
            )}
            {onShareLink && screenshot && (
              <Squircle
                as="button"
                cornerRadius={16}
                type="button"
                className="catalogue-lightbox-mini-actions__btn"
                onClick={() => onShareLink(screenshot.id)}
                title="Copy share link"
                aria-label="Copy share link"
              >
                <Copy size={20} aria-hidden="true" />
              </Squircle>
            )}
          </div>
          <div className="catalogue-family-lightbox">
            <div className="catalogue-family-lightbox__summary">
              {/* Desktop-only title at the top of the side panel.
                  Mirrors the header's <EditableTitle> so editing still
                  works on desktop after the header is hidden via CSS.
                  Hidden on mobile (mobile keeps the title in the header). */}
              <div className="catalogue-lightbox-side-title">
                <EditableTitle
                  as="span"
                  className="catalogue-lightbox-name"
                  value={family.name}
                  canEdit={canEditMetadata}
                  onSave={(next) => onRenameFamily(family.id, next)}
                />
              </div>
              {/* Thumbnail shown only on mobile expanded — gives the
                  user a visual reference to the screenshot they're
                  commenting on once the sheet covers the main image.
                  Aspect ratio comes from the loaded natural image
                  dimensions when available so portrait mobile shots
                  render tall + narrow instead of squashed into a
                  fixed box. */}
              {screenshot?.image_url && (
                <div
                  className="catalogue-lightbox-sheet-thumb"
                  aria-hidden="true"
                  style={imageSize ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } as React.CSSProperties : undefined}
                >
                  <img src={screenshot.image_url} alt="" />
                </div>
              )}
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
                annotationsCount={annotations.length + pendingAnchors.length}
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
                onOpenAnnotations={() => { setSheetState((current) => (current === 'min' ? 'full' : current)); setLightboxPanel('annotations'); toggleAnnotationMode(); }}
                onOpenComments={() => { setSheetState((current) => (current === 'min' ? 'full' : current)); setLightboxPanel('comments'); }}
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
                      Com ({comments.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={lightboxPanel === 'annotations'}
                      className={`catalogue-lightbox-tab ${lightboxPanel === 'annotations' ? 'is-active' : ''}`}
                      onClick={() => setLightboxPanel('annotations')}
                    >
                      Ann ({annotations.length + pendingAnchors.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={lightboxPanel === 'ui-elements'}
                      className={`catalogue-lightbox-tab ${lightboxPanel === 'ui-elements' ? 'is-active' : ''}`}
                      onClick={() => setLightboxPanel('ui-elements')}
                    >
                      UI-E ({uiElementAnnotations.length})
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
                    <Squircle
                      as="input"
                      cornerRadius={10}
                      type="text"
                      value={newComment}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewComment(event.target.value)}
                      onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key === 'Enter') void addComment();
                      }}
                      placeholder="Add a comment..."
                    />
                    <Squircle as="button" cornerRadius={10} type="button" onClick={() => void addComment()} disabled={!newComment.trim()}>
                      <Send size={16} />
                    </Squircle>
                  </div>
                </>
              ) : lightboxPanel === 'ui-elements' ? (
                <>
                  <p className="catalogue-lightbox-ui-elements-help">
                    Annotations tagged as UI Elements. Click any row to highlight that
                    region on the screenshot. Hidden in Comments / Label views so the
                    image stays clean.
                  </p>
                  {uiElementAnnotations.length === 0 ? (
                    <p className="catalogue-lightbox-comments-empty">
                      No UI Elements tagged yet. Add an area annotation in the
                      Annotations tab and check "Tag as UI Element."
                    </p>
                  ) : (
                    <div className="catalogue-lightbox-ui-elements-list">
                      {uiElementAnnotations.map((annotation, index) => (
                        <div
                          key={annotation.id}
                          role="button"
                          tabIndex={0}
                          className={`catalogue-lightbox-ui-element-row${selectedAnnotationId === annotation.id ? ' is-active' : ''}`}
                          onClick={() => setSelectedAnnotationId(annotation.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedAnnotationId(annotation.id);
                            }
                          }}
                        >
                          <span className="catalogue-lightbox-ui-element-row__index">{index + 1}</span>
                          <span className="catalogue-lightbox-ui-element-row__name">{annotation.text}</span>
                          {(isAdmin || annotation.user_email === userEmail) && (
                            <button
                              type="button"
                              className="catalogue-lightbox-ui-element-row__delete"
                              title="Delete UI Element"
                              aria-label="Delete UI Element"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteAnnotation(annotation.id);
                              }}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                  {pendingAnchors.length > 0 && (
                    <div className="catalogue-lightbox-ai-anchors">
                      <div className="catalogue-lightbox-ai-anchors__banner">
                        <span className="catalogue-lightbox-ai-anchors__dot" aria-hidden="true" />
                        <span>
                          AI suggested <strong>{pendingAnchors.length}</strong>{' '}
                          {pendingAnchors.length === 1 ? 'anchor' : 'anchors'}
                          {' · '}click a ghost to refine
                        </span>
                      </div>
                      <div className="catalogue-lightbox-ai-anchors__bulk">
                        <button
                          type="button"
                          className="catalogue-lightbox-ai-anchors__bulk-btn"
                          onClick={() => { void dismissAllAnchors(); }}
                        >
                          Dismiss all
                        </button>
                      </div>
                      <div className="catalogue-lightbox-ai-anchors__list">
                        {pendingAnchors.map((anchor) => (
                          <div key={`anchor:${anchor.name}`} className="catalogue-lightbox-ai-anchor">
                            <div className="catalogue-lightbox-ai-anchor__main">
                              <strong className="catalogue-lightbox-ai-anchor__name">{anchor.name}</strong>
                              <span className="catalogue-lightbox-ai-anchor__meta">
                                {anchor.confidence !== null
                                  ? `${Math.round(anchor.confidence * 100)}% confidence`
                                  : 'no confidence'}
                              </span>
                            </div>
                            <div className="catalogue-lightbox-ai-anchor__actions">
                              <button
                                type="button"
                                className="catalogue-lightbox-ai-anchor__btn catalogue-lightbox-ai-anchor__btn--accept"
                                onClick={() => acceptAnchor(anchor)}
                                title="Refine & accept this AI suggestion"
                                aria-label={`Accept ${anchor.name}`}
                              >
                                <Check size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="catalogue-lightbox-ai-anchor__btn catalogue-lightbox-ai-anchor__btn--reject"
                                onClick={() => { void dismissAnchor(anchor); }}
                                title="Dismiss this AI suggestion"
                                aria-label={`Dismiss ${anchor.name}`}
                              >
                                <X size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
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
