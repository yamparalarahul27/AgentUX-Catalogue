import { useEffect, useMemo, useRef, useState } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';

interface CatalogueGalleryViewProps {
  activeVariantKeys: Record<string, string>;
  families: CatalogueFamilyView[];
  flowMap: Record<string, string>;
  projectMap: Record<string, string>;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onAssignFlow: (familyId: string) => void;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenDetails: (familyId: string) => void;
  onOpenPreview: (familyId: string) => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
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

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function CatalogueGalleryView({
  activeVariantKeys,
  families,
  flowMap,
  projectMap,
  onActiveVariantChange,
  onAssignFlow,
  onDeleteFamily,
  onOpenDetails,
  onOpenPreview,
  onRenameFamily,
  onReplaceVariantImage,
}: CatalogueGalleryViewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const panStateRef = useRef<GalleryPanState | null>(null);
  const panMovedRef = useRef(false);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(families[0]?.id ?? null);
  const [zoom, setZoom] = useState(GALLERY_ZOOM_MIN);
  const [isPanning, setIsPanning] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (families.length === 0) {
      setActiveFamilyId(null);
      return;
    }

    if (!activeFamilyId || !families.some((family) => family.id === activeFamilyId)) {
      setActiveFamilyId(families[0].id);
    }
  }, [activeFamilyId, families]);

  const activeFamilyIndex = useMemo(
    () => families.findIndex((family) => family.id === activeFamilyId),
    [activeFamilyId, families],
  );
  const activeFamily = activeFamilyIndex >= 0 ? families[activeFamilyIndex] : null;
  const activeVariant = useMemo(
    () => (activeFamily ? getActiveFamilyVariant(activeFamily, activeVariantKeys[activeFamily.id]) : null),
    [activeFamily, activeVariantKeys],
  );
  const screenshot = activeVariant?.screenshot ?? null;
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    if (!activeFamily) return;
    setZoom(GALLERY_ZOOM_MIN);
    setEditingTitle(false);
    setTitleDraft(activeFamily.name);
    panStateRef.current = null;
    panMovedRef.current = false;
    setIsPanning(false);
    requestAnimationFrame(() => {
      previewRef.current?.scrollTo({ top: 0, left: 0 });
    });
  }, [activeFamily?.id, activeFamily?.name]);

  useEffect(() => {
    if (!editingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitle]);

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
  const gestureHint = zoom > GALLERY_ZOOM_MIN
    ? 'Scroll to move / Pinch to zoom / Drag to pan / Click for full preview'
    : 'Scroll to move / Pinch to zoom / Click for full preview';

  async function requestDeleteCurrent() {
    const shouldDelete = window.confirm(`Delete "${family.name}" and all of its variants?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
  }

  async function commitTitleRename() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === family.name) {
      setTitleDraft(family.name);
      return;
    }
    await onRenameFamily(family.id, trimmed);
  }

  function handleZoomIn() {
    setZoom((current) => Math.min(GALLERY_ZOOM_MAX, Number((current + GALLERY_ZOOM_STEP).toFixed(2))));
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

    const nextZoom = Math.max(GALLERY_ZOOM_MIN, Number((zoom - GALLERY_ZOOM_STEP).toFixed(2)));
    setZoom(nextZoom);
    if (nextZoom === GALLERY_ZOOM_MIN) {
      requestAnimationFrame(() => {
        previewRef.current?.scrollTo({ top: 0, left: 0 });
      });
    }
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
      setZoom((current) => Math.max(GALLERY_ZOOM_MIN, Number((current - GALLERY_ZOOM_STEP).toFixed(2))));
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
            <div className="catalogue-gallery-preview-toolbar">
              <span className="catalogue-gallery-preview-zoom">{zoomPercent}%</span>
              <span className="catalogue-gallery-preview-toolbar-copy">{gestureHint}</span>
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
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="catalogue-gallery-title-input"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => void commitTitleRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitTitleRename();
                  if (event.key === 'Escape') {
                    setEditingTitle(false);
                    setTitleDraft(family.name);
                  }
                }}
                aria-label="Edit title"
              />
            ) : (
              <h3 className="catalogue-gallery-title">
                <button
                  type="button"
                  className="catalogue-gallery-title-button"
                  onClick={() => setEditingTitle(true)}
                >
                  {family.name}
                </button>
              </h3>
            )}
            <p className="catalogue-gallery-subtitle">
              {projectMap[family.project_id] || 'Unknown project'} · {family.group || 'No group'}
            </p>
          </div>
          <button type="button" className="catalogue-gallery-flow" onClick={() => onAssignFlow(family.id)}>
            {family.flow_id ? flowMap[family.flow_id] || 'Assigned' : 'Unassigned'}
          </button>
        </div>

        <div className="catalogue-family-card__variants catalogue-family-card__variants--gallery">
          {family.variants.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`catalogue-family-card__variant ${variant.key === item.key ? 'is-active' : ''}`}
              onClick={() => onActiveVariantChange(family.id, item.key)}
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
          <button type="button" className="catalogue-list-action" onClick={() => onOpenPreview(family.id)}>
            Preview
          </button>
          <button type="button" className="catalogue-list-action" onClick={() => onOpenDetails(family.id)}>
            Edit
          </button>
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
            </>
          ) : (
            <p className="catalogue-gallery-reference-empty">No reference image</p>
          )}
        </div>
      </aside>
    </div>
  );
}
