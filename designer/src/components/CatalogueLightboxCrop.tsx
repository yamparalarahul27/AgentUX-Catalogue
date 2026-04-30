import { useEffect, useRef, useState } from 'react';

interface CatalogueLightboxCropProps {
  imageUrl: string;
  imageAlt: string;
  naturalWidth: number;
  naturalHeight: number;
  isApplying: boolean;
  annotationCount: number;
  onCancel: () => void;
  onApply: (args: { topTrim: number; bottomTrim: number }) => void;
}

interface ImgBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIN_KEEP_FRACTION = 0.05;

export function CatalogueLightboxCrop({
  imageUrl,
  imageAlt,
  naturalWidth,
  naturalHeight,
  isApplying,
  annotationCount,
  onCancel,
  onApply,
}: CatalogueLightboxCropProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgBox, setImgBox] = useState<ImgBox | null>(null);
  const [topPct, setTopPct] = useState(0);
  const [bottomPct, setBottomPct] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const dragRef = useRef<{ which: 'top' | 'bottom' } | null>(null);

  // Image with object-fit: contain doesn't always fill the container, so the
  // handles must operate on the image's actual rendered box, not the
  // container's. Recompute on image load and on window resize.
  useEffect(() => {
    function recompute() {
      const container = containerRef.current;
      const img = imgRef.current;
      if (!container || !img) return;
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      if (imgRect.width === 0 || imgRect.height === 0) return;
      setImgBox({
        top: imgRect.top - containerRect.top,
        left: imgRect.left - containerRect.left,
        width: imgRect.width,
        height: imgRect.height,
      });
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !imgBox || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const localY = event.clientY - containerRect.top - imgBox.top;
      const fraction = Math.min(1, Math.max(0, localY / imgBox.height));
      if (drag.which === 'top') {
        const max = 1 - bottomPct - MIN_KEEP_FRACTION;
        setTopPct(Math.min(max, Math.max(0, fraction)));
      } else {
        const newBottomPct = Math.min(1, Math.max(0, 1 - fraction));
        const max = 1 - topPct - MIN_KEEP_FRACTION;
        setBottomPct(Math.min(max, Math.max(0, newBottomPct)));
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [topPct, bottomPct, imgBox]);

  function startDrag(which: 'top' | 'bottom', event: React.PointerEvent) {
    event.preventDefault();
    dragRef.current = { which };
  }

  function reset() {
    setTopPct(0);
    setBottomPct(0);
    setPreviewMode(false);
  }

  // No point previewing when there's nothing to trim. Auto-fall back to edit.
  useEffect(() => {
    if (previewMode && topPct === 0 && bottomPct === 0) {
      setPreviewMode(false);
    }
  }, [previewMode, topPct, bottomPct]);

  const topPx = Math.round(topPct * naturalHeight);
  const bottomPx = Math.round(bottomPct * naturalHeight);
  const finalHeight = Math.max(1, naturalHeight - topPx - bottomPx);
  const canApply = (topPct > 0 || bottomPct > 0) && !isApplying;

  return (
    <div className="catalogue-lightbox-crop">
      <div className="catalogue-lightbox-crop__media" ref={containerRef}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt={imageAlt}
          className="catalogue-lightbox-crop__img"
          draggable={false}
          style={{ visibility: previewMode ? 'hidden' : 'visible' }}
          onLoad={() => {
            // Force a recompute now that the image has its rendered size
            const container = containerRef.current;
            const img = imgRef.current;
            if (!container || !img) return;
            const containerRect = container.getBoundingClientRect();
            const imgRect = img.getBoundingClientRect();
            setImgBox({
              top: imgRect.top - containerRect.top,
              left: imgRect.left - containerRect.left,
              width: imgRect.width,
              height: imgRect.height,
            });
          }}
        />
        {imgBox && previewMode && (
          // Preview clips the original image to the kept region by wrapping
          // it in an overflow:hidden box sized to the kept area, with the
          // image translated up so the kept region fills the box.
          <div
            className="catalogue-lightbox-crop__preview"
            style={{
              top: imgBox.top,
              left: imgBox.left,
              width: imgBox.width,
              height: (1 - topPct - bottomPct) * imgBox.height,
            }}
          >
            <img
              src={imageUrl}
              alt={imageAlt}
              draggable={false}
              style={{
                display: 'block',
                width: imgBox.width,
                height: imgBox.height,
                marginTop: -topPct * imgBox.height,
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
        {imgBox && !previewMode && (
          <>
            <div
              className="catalogue-lightbox-crop__dim"
              style={{
                top: imgBox.top,
                left: imgBox.left,
                width: imgBox.width,
                height: topPct * imgBox.height,
              }}
            />
            <div
              className="catalogue-lightbox-crop__dim"
              style={{
                top: imgBox.top + (1 - bottomPct) * imgBox.height,
                left: imgBox.left,
                width: imgBox.width,
                height: bottomPct * imgBox.height,
              }}
            />
            <div
              className="catalogue-lightbox-crop__handle"
              style={{
                top: imgBox.top + topPct * imgBox.height - 9,
                left: imgBox.left,
                width: imgBox.width,
              }}
              onPointerDown={(event) => startDrag('top', event)}
              role="slider"
              aria-label="Trim top"
              aria-valuenow={topPx}
              aria-valuemin={0}
              aria-valuemax={naturalHeight}
            >
              <span className="catalogue-lightbox-crop__handle-grip" />
            </div>
            <div
              className="catalogue-lightbox-crop__handle"
              style={{
                top: imgBox.top + (1 - bottomPct) * imgBox.height - 9,
                left: imgBox.left,
                width: imgBox.width,
              }}
              onPointerDown={(event) => startDrag('bottom', event)}
              role="slider"
              aria-label="Trim bottom"
              aria-valuenow={bottomPx}
              aria-valuemin={0}
              aria-valuemax={naturalHeight}
            >
              <span className="catalogue-lightbox-crop__handle-grip" />
            </div>
          </>
        )}
      </div>

      <div className="catalogue-lightbox-crop__footer">
        <div className="catalogue-lightbox-crop__meta">
          <span>Trim: top {topPx}px · bottom {bottomPx}px</span>
          <span className="catalogue-lightbox-crop__meta-divider">·</span>
          <span>Final: {naturalWidth}×{finalHeight}</span>
          {annotationCount > 0 && (
            <>
              <span className="catalogue-lightbox-crop__meta-divider">·</span>
              <span className="catalogue-lightbox-crop__meta-warn">
                {annotationCount} annotation{annotationCount === 1 ? '' : 's'} will be adjusted
              </span>
            </>
          )}
        </div>
        <div className="catalogue-lightbox-crop__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={reset}
            disabled={isApplying || (topPct === 0 && bottomPct === 0)}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPreviewMode((value) => !value)}
            disabled={isApplying || (topPct === 0 && bottomPct === 0)}
          >
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary catalogue-lightbox-crop__apply"
            onClick={() => onApply({ topTrim: topPx, bottomTrim: bottomPx })}
            disabled={!canApply}
          >
            {isApplying ? (
              <>
                <span className="loading-spinner-small" aria-hidden="true" />
                <span>Cropping…</span>
              </>
            ) : 'Apply (replaces)'}
          </button>
        </div>
      </div>
    </div>
  );
}
