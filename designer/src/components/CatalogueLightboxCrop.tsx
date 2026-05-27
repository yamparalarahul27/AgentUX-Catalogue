import { useEffect, useRef, useState } from 'react';

import { DotLoader } from './DotLoader';

interface CatalogueLightboxCropProps {
  imageUrl: string;
  imageAlt: string;
  naturalWidth: number;
  naturalHeight: number;
  isApplying: boolean;
  annotationCount: number;
  onCancel: () => void;
  onApply: (args: { topTrim: number; bottomTrim: number; leftTrim: number; rightTrim: number }) => void;
}

interface ImgBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

type DragSide = 'top' | 'bottom' | 'left' | 'right';

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
  const topHandleRef = useRef<HTMLDivElement>(null);
  const didInitialFocus = useRef(false);
  const [imgBox, setImgBox] = useState<ImgBox | null>(null);
  const [topPct, setTopPct] = useState(0);
  const [bottomPct, setBottomPct] = useState(0);
  const [leftPct, setLeftPct] = useState(0);
  const [rightPct, setRightPct] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const dragRef = useRef<{ which: DragSide } | null>(null);

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

      if (drag.which === 'top' || drag.which === 'bottom') {
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
        return;
      }

      const localX = event.clientX - containerRect.left - imgBox.left;
      const fraction = Math.min(1, Math.max(0, localX / imgBox.width));
      if (drag.which === 'left') {
        const max = 1 - rightPct - MIN_KEEP_FRACTION;
        setLeftPct(Math.min(max, Math.max(0, fraction)));
      } else {
        const newRightPct = Math.min(1, Math.max(0, 1 - fraction));
        const max = 1 - leftPct - MIN_KEEP_FRACTION;
        setRightPct(Math.min(max, Math.max(0, newRightPct)));
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
  }, [topPct, bottomPct, leftPct, rightPct, imgBox]);

  function startDrag(which: DragSide, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    // Divs with tabIndex don't receive focus on click by default.
    // Explicit focus() ensures arrow-key nudging works immediately
    // after the user clicks a handle (no Tab gymnastics needed).
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = { which };
  }

  // Auto-focus the top handle once the image has measured (imgBox is
  // set after the first onLoad / recompute). Means the user can crop-
  // open via 'C' and immediately use arrow keys — no Tab required.
  // Guarded so a later resize/recompute doesn't yank focus away from
  // whichever handle the user is interacting with.
  useEffect(() => {
    if (!imgBox || didInitialFocus.current) return;
    didInitialFocus.current = true;
    topHandleRef.current?.focus({ preventScroll: true });
  }, [imgBox]);

  // Keyboard nudge for each handle. 1% step normally, 5% with Shift —
  // mirrors the slider convention (small step / page step). Arrow key
  // direction maps to handle direction-of-travel: top handle ↑/↓
  // moves it up/down, bottom handle ↑/↓ same (so increasing the
  // bottom trim shifts the handle UP — matches what you see), and
  // similarly left/right ←/→.
  function nudgeTrim(which: DragSide, delta: number) {
    if (which === 'top') {
      const max = 1 - bottomPct - MIN_KEEP_FRACTION;
      setTopPct((v) => Math.min(max, Math.max(0, v + delta)));
    } else if (which === 'bottom') {
      const max = 1 - topPct - MIN_KEEP_FRACTION;
      setBottomPct((v) => Math.min(max, Math.max(0, v + delta)));
    } else if (which === 'left') {
      const max = 1 - rightPct - MIN_KEEP_FRACTION;
      setLeftPct((v) => Math.min(max, Math.max(0, v + delta)));
    } else {
      const max = 1 - leftPct - MIN_KEEP_FRACTION;
      setRightPct((v) => Math.min(max, Math.max(0, v + delta)));
    }
  }

  function handleHandleKeyDown(which: DragSide, event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    let delta = 0;
    if (which === 'top') {
      if (event.key === 'ArrowUp') delta = -step;
      else if (event.key === 'ArrowDown') delta = step;
      else return;
    } else if (which === 'bottom') {
      // Bottom handle: ↑ pulls trim up (more cropped from the bottom).
      if (event.key === 'ArrowUp') delta = step;
      else if (event.key === 'ArrowDown') delta = -step;
      else return;
    } else if (which === 'left') {
      if (event.key === 'ArrowLeft') delta = -step;
      else if (event.key === 'ArrowRight') delta = step;
      else return;
    } else {
      // Right handle: ← pulls trim leftward (more cropped from the right).
      if (event.key === 'ArrowLeft') delta = step;
      else if (event.key === 'ArrowRight') delta = -step;
      else return;
    }
    event.preventDefault();
    nudgeTrim(which, delta);
  }

  function reset() {
    setTopPct(0);
    setBottomPct(0);
    setLeftPct(0);
    setRightPct(0);
    setPreviewMode(false);
  }

  const hasTrim = topPct > 0 || bottomPct > 0 || leftPct > 0 || rightPct > 0;

  // No point previewing when there's nothing to trim. Auto-fall back to edit.
  useEffect(() => {
    if (previewMode && !hasTrim) {
      setPreviewMode(false);
    }
  }, [previewMode, hasTrim]);

  const topPx = Math.round(topPct * naturalHeight);
  const bottomPx = Math.round(bottomPct * naturalHeight);
  const leftPx = Math.round(leftPct * naturalWidth);
  const rightPx = Math.round(rightPct * naturalWidth);
  const finalWidth = Math.max(1, naturalWidth - leftPx - rightPx);
  const finalHeight = Math.max(1, naturalHeight - topPx - bottomPx);
  const canApply = hasTrim && !isApplying;

  // Enter applies the crop when there's a trim to apply and we're not already
  // applying. Esc cancels at any time (unless we're mid-apply). Both
  // suppressed when an input/textarea/contenteditable is focused.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (event.key === 'Escape') {
        if (isApplying) return;
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter') {
        if (!canApply) return;
        event.preventDefault();
        onApply({ topTrim: topPx, bottomTrim: bottomPx, leftTrim: leftPx, rightTrim: rightPx });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canApply, isApplying, onApply, onCancel, topPx, bottomPx, leftPx, rightPx]);

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
          // Preview clips the original image to the kept rect by wrapping it
          // in an overflow:hidden box sized to the kept area, with the inner
          // image translated up/left so the kept region fills the box.
          <div
            className="catalogue-lightbox-crop__preview"
            style={{
              top: imgBox.top + topPct * imgBox.height,
              left: imgBox.left + leftPct * imgBox.width,
              width: (1 - leftPct - rightPct) * imgBox.width,
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
                marginLeft: -leftPct * imgBox.width,
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
        {imgBox && !previewMode && (
          <>
            {/* Dim bands: top / bottom span full image width;
                left / right span only the kept-vertical strip so they
                don't overlap the top/bottom bands. */}
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
              className="catalogue-lightbox-crop__dim"
              style={{
                top: imgBox.top + topPct * imgBox.height,
                left: imgBox.left,
                width: leftPct * imgBox.width,
                height: (1 - topPct - bottomPct) * imgBox.height,
              }}
            />
            <div
              className="catalogue-lightbox-crop__dim"
              style={{
                top: imgBox.top + topPct * imgBox.height,
                left: imgBox.left + (1 - rightPct) * imgBox.width,
                width: rightPct * imgBox.width,
                height: (1 - topPct - bottomPct) * imgBox.height,
              }}
            />

            <div
              ref={topHandleRef}
              className="catalogue-lightbox-crop__handle catalogue-lightbox-crop__handle--horizontal"
              style={{
                top: imgBox.top + topPct * imgBox.height - 9,
                left: imgBox.left,
                width: imgBox.width,
              }}
              onPointerDown={(event) => startDrag('top', event)}
              onKeyDown={(event) => handleHandleKeyDown('top', event)}
              tabIndex={0}
              role="slider"
              aria-label="Trim top (Arrow Up/Down, Shift for 5%)"
              aria-valuenow={topPx}
              aria-valuemin={0}
              aria-valuemax={naturalHeight}
              aria-orientation="vertical"
            >
              <span className="catalogue-lightbox-crop__handle-grip" />
            </div>
            <div
              className="catalogue-lightbox-crop__handle catalogue-lightbox-crop__handle--horizontal"
              style={{
                top: imgBox.top + (1 - bottomPct) * imgBox.height - 9,
                left: imgBox.left,
                width: imgBox.width,
              }}
              onPointerDown={(event) => startDrag('bottom', event)}
              onKeyDown={(event) => handleHandleKeyDown('bottom', event)}
              tabIndex={0}
              role="slider"
              aria-label="Trim bottom (Arrow Up/Down, Shift for 5%)"
              aria-valuenow={bottomPx}
              aria-valuemin={0}
              aria-valuemax={naturalHeight}
              aria-orientation="vertical"
            >
              <span className="catalogue-lightbox-crop__handle-grip" />
            </div>
            <div
              className="catalogue-lightbox-crop__handle catalogue-lightbox-crop__handle--vertical"
              style={{
                top: imgBox.top,
                left: imgBox.left + leftPct * imgBox.width - 9,
                height: imgBox.height,
              }}
              onPointerDown={(event) => startDrag('left', event)}
              onKeyDown={(event) => handleHandleKeyDown('left', event)}
              tabIndex={0}
              role="slider"
              aria-label="Trim left (Arrow Left/Right, Shift for 5%)"
              aria-valuenow={leftPx}
              aria-valuemin={0}
              aria-valuemax={naturalWidth}
              aria-orientation="horizontal"
            >
              <span className="catalogue-lightbox-crop__handle-grip catalogue-lightbox-crop__handle-grip--vertical" />
            </div>
            <div
              className="catalogue-lightbox-crop__handle catalogue-lightbox-crop__handle--vertical"
              style={{
                top: imgBox.top,
                left: imgBox.left + (1 - rightPct) * imgBox.width - 9,
                height: imgBox.height,
              }}
              onPointerDown={(event) => startDrag('right', event)}
              onKeyDown={(event) => handleHandleKeyDown('right', event)}
              tabIndex={0}
              role="slider"
              aria-label="Trim right (Arrow Left/Right, Shift for 5%)"
              aria-valuenow={rightPx}
              aria-valuemin={0}
              aria-valuemax={naturalWidth}
              aria-orientation="horizontal"
            >
              <span className="catalogue-lightbox-crop__handle-grip catalogue-lightbox-crop__handle-grip--vertical" />
            </div>
          </>
        )}
      </div>

      <div className="catalogue-lightbox-crop__footer">
        <div className="catalogue-lightbox-crop__meta">
          <span>Trim: T {topPx}px · B {bottomPx}px · L {leftPx}px · R {rightPx}px</span>
          <span className="catalogue-lightbox-crop__meta-divider">·</span>
          <span>Final: {finalWidth}×{finalHeight}</span>
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
            disabled={isApplying || !hasTrim}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPreviewMode((value) => !value)}
            disabled={isApplying || !hasTrim}
          >
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isApplying}
            title="Cancel (Esc)"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary catalogue-lightbox-crop__apply"
            onClick={() => onApply({ topTrim: topPx, bottomTrim: bottomPx, leftTrim: leftPx, rightTrim: rightPx })}
            disabled={!canApply}
            title={canApply ? 'Apply crop (Enter)' : 'Drag a handle to set a crop area'}
          >
            {isApplying ? (
              <>
                <DotLoader size="sm" ariaLabel="Cropping" />
                <span>Cropping…</span>
              </>
            ) : 'Apply (replaces)'}
          </button>
        </div>
      </div>
    </div>
  );
}
