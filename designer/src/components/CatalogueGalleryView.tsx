import { useEffect, useMemo, useRef, useState } from 'react';
import { getActiveFamilyVariant, getVariantKey, type CatalogueFamilyView } from '../lib/catalogue-families';
import type { MobileOs, WebPreset } from '../types';
interface CatalogueGalleryViewProps {
  activeVariantKeys: Record<string, string>;
  families: CatalogueFamilyView[];
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenPreview: (familyId: string) => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onRemoveReference: (screenshotId: string) => Promise<boolean>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onSetFlowLabel: (familyId: string, flowLabel: string | null) => Promise<boolean>;
  onUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: MobileOs | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
  webPresets: WebPreset[];
}
const GALLERY_ZOOM_MIN = 1;
const GALLERY_ZOOM_MAX = 3;
const GALLERY_ZOOM_STEP = 0.25;
const GALLERY_DOUBLE_CLICK_ZOOM = 2;
interface GalleryPanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}
interface GalleryInlineDraft {
  familyName: string;
  groupName: string;
  flowLabel: string;
  screenshotId: string;
  theme: 'light' | 'dark' | null;
  platform: 'mobile' | 'web' | null;
  webPresetKey: string | null;
  mobileOs: MobileOs | null;
}
function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function buildInlineDraft(
  family: CatalogueFamilyView,
  variantKey: string | null | undefined,
): GalleryInlineDraft | null {
  const activeVariant = getActiveFamilyVariant(family, variantKey);
  const screenshot = activeVariant?.screenshot ?? null;
  if (!screenshot) return null;
  return {
    familyName: family.name,
    groupName: family.group || '',
    flowLabel: family.flow_label || '',
    screenshotId: screenshot.id,
    theme: screenshot.theme || null,
    platform: screenshot.platform || null,
    webPresetKey: screenshot.web_preset_key || null,
    mobileOs: screenshot.mobile_os || null,
  };
}
function isInlineDraftValid(draft: GalleryInlineDraft | null): boolean {
  if (!draft) return false;
  if (!draft.familyName.trim()) return false;
  if (!draft.theme) return false;
  if (draft.platform === 'web') return Boolean(draft.webPresetKey);
  if (draft.platform === 'mobile') return Boolean(draft.mobileOs);
  return false;
}
export function CatalogueGalleryView({
  activeVariantKeys,
  families,
  onActiveVariantChange,
  onChangeFamilyGroup,
  onDeleteFamily,
  onOpenPreview,
  onRenameFamily,
  onRemoveReference,
  onReplaceVariantImage,
  onSetFlowLabel,
  onUpdateVariantDetails,
  webPresets,
}: CatalogueGalleryViewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panStateRef = useRef<GalleryPanState | null>(null);
  const panMovedRef = useRef(false);
  const lastActiveIndexRef = useRef(0);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(families[0]?.id ?? null);
  const [zoom, setZoom] = useState(GALLERY_ZOOM_MIN);
  const [isPanning, setIsPanning] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<GalleryInlineDraft | null>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);
  useEffect(() => {
    if (families.length === 0) {
      setActiveFamilyId(null);
      return;
    }
    if (!activeFamilyId || !families.some((family) => family.id === activeFamilyId)) {
      if (!activeFamilyId) {
        setActiveFamilyId(families[0].id);
        return;
      }
      const fallbackIndex = Math.min(lastActiveIndexRef.current, families.length - 1);
      setActiveFamilyId(families[fallbackIndex].id);
    }
  }, [activeFamilyId, families]);
  const activeFamilyIndex = useMemo(
    () => families.findIndex((family) => family.id === activeFamilyId),
    [activeFamilyId, families],
  );
  const activeFamily = activeFamilyIndex >= 0 ? families[activeFamilyIndex] : null;
  useEffect(() => {
    if (activeFamilyIndex >= 0) {
      lastActiveIndexRef.current = activeFamilyIndex;
    }
  }, [activeFamilyIndex]);
  const activeVariant = useMemo(
    () => (activeFamily ? getActiveFamilyVariant(activeFamily, activeVariantKeys[activeFamily.id]) : null),
    [activeFamily, activeVariantKeys],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const zoomPercent = Math.round(zoom * 100);
  useEffect(() => {
    if (!activeFamily) return;
    setZoom(GALLERY_ZOOM_MIN);
    setIsInlineEditing(false);
    setInlineDraft(buildInlineDraft(activeFamily, activeVariantKeys[activeFamily.id]));
    panStateRef.current = null;
    panMovedRef.current = false;
    setIsPanning(false);
    requestAnimationFrame(() => {
      previewRef.current?.scrollTo({ top: 0, left: 0 });
    });
  }, [activeFamily?.id]);
  useEffect(() => {
    if (!activeFamily || !activeVariant || !isInlineEditing) return;
    setInlineDraft((previous) => {
      const fresh = buildInlineDraft(activeFamily, activeVariant.key);
      if (!fresh) return previous;
      if (!previous) return fresh;
      return {
        ...fresh,
        familyName: previous.familyName,
        groupName: previous.groupName,
        flowLabel: previous.flowLabel,
      };
    });
  }, [activeFamily, activeVariant, isInlineEditing]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!activeFamily || families.length <= 1) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft' && activeFamilyIndex > 0) {
        setActiveFamilyId(families[activeFamilyIndex - 1].id);
      }
      if (event.key === 'ArrowRight' && activeFamilyIndex < families.length - 1) {
        setActiveFamilyId(families[activeFamilyIndex + 1].id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFamily, activeFamilyIndex, families]);
  if (!activeFamily || !activeVariant || !screenshot) {
    return null;
  }
  const family = activeFamily;
  const variant = activeVariant;
  const activeScreenshot = screenshot;
  const canSaveInline = isInlineDraftValid(inlineDraft) && !isSavingInline;
  async function requestDeleteCurrent() {
    const shouldDelete = window.confirm(`Delete "${family.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
  }
  async function requestRemoveReference() {
    if (!activeScreenshot.reference_url && !activeScreenshot.reference_storage_path) return;
    const shouldRemove = window.confirm('Remove this reference image from the screenshot?');
    if (!shouldRemove) return;
    await onRemoveReference(activeScreenshot.id);
  }
  function beginInlineEdit() {
    setInlineDraft(buildInlineDraft(family, variant.key));
    setIsInlineEditing(true);
  }
  function cancelInlineEdit() {
    setInlineDraft(buildInlineDraft(family, variant.key));
    setIsInlineEditing(false);
  }
  function handlePlatformDraftChange(platform: 'mobile' | 'web' | null) {
    setInlineDraft((previous) => {
      if (!previous) return previous;
      if (platform === 'web') {
        return {
          ...previous,
          platform,
          mobileOs: null,
          webPresetKey: previous.webPresetKey || webPresets[0]?.key || null,
        };
      }
      if (platform === 'mobile') {
        return {
          ...previous,
          platform,
          webPresetKey: null,
          mobileOs: previous.mobileOs || 'ios',
        };
      }
      return {
        ...previous,
        platform,
        webPresetKey: null,
        mobileOs: null,
      };
    });
  }
  async function saveInlineEdit() {
    if (!inlineDraft || !isInlineDraftValid(inlineDraft)) return;
    setIsSavingInline(true);
    try {
      const trimmedName = inlineDraft.familyName.trim();
      const trimmedGroup = inlineDraft.groupName.trim();
      const trimmedFlow = inlineDraft.flowLabel.trim();
      if (trimmedName !== family.name) {
        await onRenameFamily(family.id, trimmedName);
      }
      if (trimmedGroup !== (family.group || '')) {
        await onChangeFamilyGroup(family.id, trimmedGroup || null);
      }
      if (trimmedFlow !== (family.flow_label || '')) {
        const flowUpdated = await onSetFlowLabel(family.id, trimmedFlow || null);
        if (!flowUpdated) return;
      }
      const variantChanged = (
        inlineDraft.theme !== activeScreenshot.theme
        || inlineDraft.platform !== activeScreenshot.platform
        || inlineDraft.webPresetKey !== activeScreenshot.web_preset_key
        || inlineDraft.mobileOs !== activeScreenshot.mobile_os
      );
      if (variantChanged) {
        const variantUpdated = await onUpdateVariantDetails(inlineDraft.screenshotId, {
          theme: inlineDraft.theme,
          platform: inlineDraft.platform,
          web_preset_key: inlineDraft.webPresetKey,
          mobile_os: inlineDraft.mobileOs,
        });
        if (!variantUpdated) return;
        const nextVariantKey = getVariantKey({
          ...activeScreenshot,
          theme: inlineDraft.theme,
          platform: inlineDraft.platform,
          web_preset_key: inlineDraft.webPresetKey,
          mobile_os: inlineDraft.mobileOs,
        });
        onActiveVariantChange(family.id, nextVariantKey);
      }
      setIsInlineEditing(false);
    } finally {
      setIsSavingInline(false);
    }
  }
  function handleZoomIn() {
    setZoom((current) => Math.min(GALLERY_ZOOM_MAX, Number((current + GALLERY_ZOOM_STEP).toFixed(2))));
  }
  function handleZoomOut() {
    setZoom((current) => {
      const nextZoom = Math.max(GALLERY_ZOOM_MIN, Number((current - GALLERY_ZOOM_STEP).toFixed(2)));
      if (nextZoom === GALLERY_ZOOM_MIN) {
        requestAnimationFrame(() => {
          previewRef.current?.scrollTo({ top: 0, left: 0 });
        });
      }
      return nextZoom;
    });
  }
  function handleZoomReset() {
    setZoom(GALLERY_ZOOM_MIN);
    requestAnimationFrame(() => {
      previewRef.current?.scrollTo({ top: 0, left: 0 });
    });
  }
  function handlePreviewWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!activeScreenshot.image_url || !event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      handleZoomIn();
      return;
    }
    handleZoomOut();
  }
  function handlePreviewPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!activeScreenshot.image_url || zoom <= GALLERY_ZOOM_MIN || event.button !== 0) return;
    const preview = previewRef.current;
    if (!preview) return;
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: preview.scrollLeft,
      scrollTop: preview.scrollTop,
    };
    panMovedRef.current = false;
    preview.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }
  function handlePreviewPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const preview = previewRef.current;
    const panState = panStateRef.current;
    if (!preview || !panState || panState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      panMovedRef.current = true;
    }
    preview.scrollLeft = panState.scrollLeft - deltaX;
    preview.scrollTop = panState.scrollTop - deltaY;
  }
  function finishPan(pointerId?: number) {
    const preview = previewRef.current;
    if (preview && typeof pointerId === 'number' && preview.hasPointerCapture(pointerId)) {
      preview.releasePointerCapture(pointerId);
    }
    panStateRef.current = null;
    setIsPanning(false);
  }
  function handlePreviewDoubleClick() {
    if (!activeScreenshot.image_url) return;
    if (zoom > GALLERY_ZOOM_MIN) {
      handleZoomReset();
      return;
    }
    setZoom(Math.min(GALLERY_ZOOM_MAX, GALLERY_DOUBLE_CLICK_ZOOM));
  }
  function handlePreviewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!activeScreenshot.image_url) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      handleZoomIn();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      handleZoomOut();
    } else if (event.key === '0') {
      event.preventDefault();
      handleZoomReset();
    }
  }
  function handlePreviewClick() {
    if (panMovedRef.current) {
      panMovedRef.current = false;
      return;
    }
    onOpenPreview(family.id);
  }
  function handleVariantSelect(variantKey: string) {
    onActiveVariantChange(family.id, variantKey);
    if (!isInlineEditing) return;
    const selectedVariant = family.variants.find((item) => item.key === variantKey);
    if (!selectedVariant) return;
    setInlineDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        screenshotId: selectedVariant.screenshot.id,
        theme: selectedVariant.screenshot.theme || null,
        platform: selectedVariant.screenshot.platform || null,
        webPresetKey: selectedVariant.screenshot.web_preset_key || null,
        mobileOs: selectedVariant.screenshot.mobile_os || null,
      };
    });
  }
  return (
    <div className="catalogue-gallery">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void onReplaceVariantImage(activeScreenshot.id, file);
          }
          event.target.value = '';
        }}
      />
      <div className="catalogue-gallery-main">
        <div
          ref={previewRef}
          className={`catalogue-gallery-preview ${zoom > GALLERY_ZOOM_MIN ? 'is-zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
          role="button"
          onClick={handlePreviewClick}
          onWheel={handlePreviewWheel}
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={(event) => finishPan(event.pointerId)}
          onPointerCancel={(event) => finishPan(event.pointerId)}
          onDoubleClick={handlePreviewDoubleClick}
          onKeyDown={handlePreviewKeyDown}
          tabIndex={activeScreenshot.image_url ? 0 : -1}
          aria-label={activeScreenshot.image_url ? 'Preview image. Scroll to move, pinch to zoom, drag to pan when zoomed in, and click to open the full preview.' : undefined}
        >
          {activeScreenshot.image_url && (
            <div
              className="catalogue-gallery-preview-toolbar"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="catalogue-gallery-preview-controls">
                <button
                  type="button"
                  className="catalogue-gallery-preview-btn"
                  disabled={zoom <= GALLERY_ZOOM_MIN}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleZoomOut();
                  }}
                >
                  -
                </button>
                <span className="catalogue-gallery-preview-zoom">{zoomPercent}%</span>
                <button
                  type="button"
                  className="catalogue-gallery-preview-btn"
                  disabled={zoom >= GALLERY_ZOOM_MAX}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleZoomIn();
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="catalogue-gallery-preview-btn"
                  disabled={zoom <= GALLERY_ZOOM_MIN}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleZoomReset();
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
          {activeScreenshot.image_url ? (
            <div className="catalogue-gallery-preview-stage">
              <img
                src={activeScreenshot.image_url}
                alt={`${family.name} ${variant.label}`}
                draggable={false}
                style={{
                  width: zoom > GALLERY_ZOOM_MIN ? `${zoom * 100}%` : undefined,
                  maxWidth: zoom > GALLERY_ZOOM_MIN ? 'none' : undefined,
                  maxHeight: zoom > GALLERY_ZOOM_MIN ? 'none' : undefined,
                }}
              />
            </div>
          ) : (
            <div className="catalogue-gallery-preview-empty">No image available</div>
          )}
        </div>
        <div className="catalogue-gallery-strip">
          {families.map((item) => {
            const currentVariant = getActiveFamilyVariant(item, activeVariantKeys[item.id]);
            const image = currentVariant?.screenshot.image_url;
            return (
              <button
                key={item.id}
                type="button"
                className={`catalogue-gallery-thumb ${item.id === family.id ? 'is-active' : ''}`}
                onClick={() => setActiveFamilyId(item.id)}
              >
                {image ? <img src={image} alt={item.name} draggable={false} /> : <span>No image</span>}
                <span className="catalogue-gallery-thumb__label">{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <aside className="catalogue-gallery-meta catalogue-gallery-meta--family">
        <div className="catalogue-gallery-meta-head catalogue-gallery-meta-head--stack">
          <div className="catalogue-gallery-meta-copy">
            <h3 className="catalogue-gallery-title">{family.name}</h3>
            <p className="catalogue-gallery-subtitle">
              {family.group || 'No group'}
            </p>
          </div>
          <span className="catalogue-gallery-flow">
            {family.flow_label || 'Unassigned'}
          </span>
        </div>
        {isInlineEditing && inlineDraft ? (
          <div className="catalogue-gallery-inline-editor">
            <div className="catalogue-list-inline-editor__head">
              <strong>Editing {variant.label}</strong>
              <span>Changes apply to this screenshot.</span>
            </div>
            <div className="catalogue-list-inline-editor__grid">
              <label className="catalogue-list-inline-editor__field">
                <span>Screenshot name</span>
                <input
                  type="text"
                  value={inlineDraft.familyName}
                  onChange={(event) => setInlineDraft((previous) => previous ? { ...previous, familyName: event.target.value } : previous)}
                />
              </label>
              <label className="catalogue-list-inline-editor__field">
                <span>Group</span>
                <input
                  type="text"
                  value={inlineDraft.groupName}
                  onChange={(event) => setInlineDraft((previous) => previous ? { ...previous, groupName: event.target.value } : previous)}
                />
              </label>
              <label className="catalogue-list-inline-editor__field">
                <span>Flow</span>
                <input
                  type="text"
                  value={inlineDraft.flowLabel}
                  onChange={(event) => setInlineDraft((previous) => previous ? { ...previous, flowLabel: event.target.value } : previous)}
                  placeholder="Type a flow label"
                />
              </label>
              <div className="catalogue-list-inline-editor__field">
                <span>Theme</span>
                <div className="catalogue-list-inline-editor__chips">
                  {(['light', 'dark'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`catalogue-family-card__variant ${inlineDraft.theme === item ? 'is-active' : ''}`}
                      onClick={() => setInlineDraft((previous) => previous ? { ...previous, theme: item } : previous)}
                    >
                      {item === 'light' ? 'Light' : 'Dark'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="catalogue-list-inline-editor__field">
                <span>Platform</span>
                <div className="catalogue-list-inline-editor__chips">
                  {(['web', 'mobile'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`catalogue-family-card__variant ${inlineDraft.platform === item ? 'is-active' : ''}`}
                      onClick={() => handlePlatformDraftChange(item)}
                    >
                      {item === 'web' ? 'Web' : 'Mobile'}
                    </button>
                  ))}
                </div>
              </div>
              {inlineDraft.platform === 'web' ? (
                <label className="catalogue-list-inline-editor__field">
                  <span>Web preset</span>
                  <select
                    value={inlineDraft.webPresetKey || ''}
                    onChange={(event) => setInlineDraft((previous) => previous
                      ? {
                        ...previous,
                        webPresetKey: event.target.value || null,
                        mobileOs: null,
                      }
                      : previous)}
                  >
                    <option value="">Select web preset</option>
                    {webPresets.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label} ({preset.width}px)
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {inlineDraft.platform === 'mobile' ? (
                <div className="catalogue-list-inline-editor__field">
                  <span>Mobile OS</span>
                  <div className="catalogue-list-inline-editor__chips">
                    {(['ios', 'android'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`catalogue-family-card__variant ${inlineDraft.mobileOs === item ? 'is-active' : ''}`}
                        onClick={() => setInlineDraft((previous) => previous ? { ...previous, mobileOs: item, webPresetKey: null } : previous)}
                      >
                        {item === 'ios' ? 'iOS' : 'Android'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="catalogue-family-card__variants catalogue-family-card__variants--gallery">
          {family.variants.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`catalogue-family-card__variant ${variant.key === item.key ? 'is-active' : ''}`}
              onClick={() => handleVariantSelect(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="catalogue-gallery-meta-grid">
          <div className="catalogue-gallery-meta-row">
            <span>Variant</span>
            <strong>{variant.label}</strong>
          </div>
          <div className="catalogue-gallery-meta-row">
            <span>Comments</span>
            <strong>{activeScreenshot.comment_count ?? 0}</strong>
          </div>
          <div className="catalogue-gallery-meta-row">
            <span>Annotations</span>
            <strong>{activeScreenshot.annotation_count ?? 0}</strong>
          </div>
          <div className="catalogue-gallery-meta-row">
            <span>Created</span>
            <strong>{formatDateTime(activeScreenshot.created_at || family.created_at)}</strong>
          </div>
        </div>
        <div className="catalogue-gallery-actions">
          {isInlineEditing ? (
            <>
              <button
                type="button"
                className="catalogue-list-action is-primary"
                onClick={() => void saveInlineEdit()}
                disabled={!canSaveInline}
              >
                {isSavingInline ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="catalogue-list-action"
                onClick={cancelInlineEdit}
                disabled={isSavingInline}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="catalogue-list-action" onClick={beginInlineEdit}>
              Edit
            </button>
          )}
          <button type="button" className="catalogue-list-action" onClick={() => fileInputRef.current?.click()}>
            Reupload
          </button>
          <button type="button" className="catalogue-list-action is-danger" onClick={() => void requestDeleteCurrent()}>
            Delete
          </button>
        </div>
        <div className="catalogue-gallery-reference">
          <h4>Reference Image</h4>
          {activeScreenshot.reference_url ? (
            <>
              <img src={activeScreenshot.reference_url} alt={activeScreenshot.reference_label || 'Reference'} draggable={false} />
              <p>{activeScreenshot.reference_label || 'Reference'}</p>
              <button
                type="button"
                className="catalogue-gallery-reference-remove"
                onClick={() => void requestRemoveReference()}
              >
                Remove reference
              </button>
            </>
          ) : (
            <p className="catalogue-gallery-reference-empty">No reference image</p>
          )}
        </div>
      </aside>
    </div>
  );
}
