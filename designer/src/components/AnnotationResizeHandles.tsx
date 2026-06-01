import { useEffect, useRef } from 'react';

export interface AnnotationBbox {
  x: number;       // 0-100, top-left
  y: number;       // 0-100, top-left
  width: number;   // 0-100
  height: number;  // 0-100
}

interface MediaLayout {
  left: number;    // pixel offset of image inside container
  top: number;
  width: number;   // pixel size of rendered image
  height: number;
}

interface AnnotationResizeHandlesProps {
  bbox: AnnotationBbox;
  mediaLayout: MediaLayout;
  // Live callback as the user drags. The parent should update local
  // bbox state so the area frame redraws.
  onResize: (next: AnnotationBbox) => void;
  // Fires on pointerup with the final bbox. Use for DB persistence.
  // Skipped if the user releases without dragging.
  onResizeEnd?: (final: AnnotationBbox) => void;
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// Smallest bbox dimension we allow when resizing — keeps the
// annotation visible + clickable. Same value as the crop tool's
// MIN_KEEP_FRACTION × 100.
const MIN_DIM = 1;

// Apply the pointer delta to one of the 8 handles. Returns a new
// bbox (still in 0-100 percent space). Math is straightforward:
// north handles change y/height, south handles change height only,
// west handles change x/width, east handles change width only.
// Corners combine vertical and horizontal moves.
function applyDelta(start: AnnotationBbox, handle: HandleId, dx: number, dy: number): AnnotationBbox {
  let { x, y, width, height } = start;
  // Vertical edges (n / s) — width unchanged.
  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    y = start.y + dy;
    height = start.height - dy;
  } else if (handle === 'sw' || handle === 's' || handle === 'se') {
    height = start.height + dy;
  }
  // Horizontal edges (w / e) — height unchanged unless corner.
  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    x = start.x + dx;
    width = start.width - dx;
  } else if (handle === 'ne' || handle === 'e' || handle === 'se') {
    width = start.width + dx;
  }
  // If width went negative (user dragged past the opposite edge),
  // flip x so the bbox stays valid. Same for height.
  if (width < 0) {
    x = x + width;
    width = -width;
  }
  if (height < 0) {
    y = y + height;
    height = -height;
  }
  // Enforce min dim.
  if (width < MIN_DIM) width = MIN_DIM;
  if (height < MIN_DIM) height = MIN_DIM;
  // Clamp to image bounds — annotations don't extend past the image.
  if (x < 0) { width = Math.max(MIN_DIM, width + x); x = 0; }
  if (y < 0) { height = Math.max(MIN_DIM, height + y); y = 0; }
  if (x + width > 100) width = 100 - x;
  if (y + height > 100) height = 100 - y;
  return { x, y, width, height };
}

// Pixel offset from the bbox top-left for each handle, in container coords.
function handleScreenPos(handle: HandleId, bbox: AnnotationBbox, layout: MediaLayout) {
  const left = layout.left + (bbox.x / 100) * layout.width;
  const top = layout.top + (bbox.y / 100) * layout.height;
  const w = (bbox.width / 100) * layout.width;
  const h = (bbox.height / 100) * layout.height;
  const midX = left + w / 2;
  const midY = top + h / 2;
  const right = left + w;
  const bottom = top + h;
  switch (handle) {
    case 'nw': return { left, top };
    case 'n':  return { left: midX, top };
    case 'ne': return { left: right, top };
    case 'e':  return { left: right, top: midY };
    case 'se': return { left: right, top: bottom };
    case 's':  return { left: midX, top: bottom };
    case 'sw': return { left, top: bottom };
    case 'w':  return { left, top: midY };
  }
}

// 8 small grab handles around an area annotation. Dragging any
// handle updates the bbox; release commits. Designed to be dropped
// inside the existing .catalogue-lightbox-pin-layer so it shares
// the same coordinate system as the annotations themselves.
export function AnnotationResizeHandles({ bbox, mediaLayout, onResize, onResizeEnd }: AnnotationResizeHandlesProps) {
  // Hold the start state of a drag so percent math is delta-based
  // (avoids drift from repeatedly converting client positions to
  // percent and back).
  const dragRef = useRef<{
    handle: HandleId;
    startBbox: AnnotationBbox;
    startClientX: number;
    startClientY: number;
    finalBbox: AnnotationBbox;
  } | null>(null);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      // Convert pixel delta → percent delta using the image's rendered size.
      const dxPct = ((event.clientX - drag.startClientX) / mediaLayout.width) * 100;
      const dyPct = ((event.clientY - drag.startClientY) / mediaLayout.height) * 100;
      const next = applyDelta(drag.startBbox, drag.handle, dxPct, dyPct);
      drag.finalBbox = next;
      onResize(next);
    }
    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      if (onResizeEnd) onResizeEnd(drag.finalBbox);
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
  }, [mediaLayout.width, mediaLayout.height, onResize, onResizeEnd]);

  function startDrag(handle: HandleId, event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = {
      handle,
      startBbox: { ...bbox },
      startClientX: event.clientX,
      startClientY: event.clientY,
      finalBbox: { ...bbox },
    };
  }

  return (
    <>
      {HANDLES.map((handle) => {
        const pos = handleScreenPos(handle, bbox, mediaLayout);
        return (
          <div
            key={handle}
            className={`annotation-handle annotation-handle--${handle}`}
            style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
            onPointerDown={(event) => startDrag(handle, event)}
            // Stop click bubbling so the parent annotation's onClick
            // (which selects) doesn't fire and override selection.
            onClick={(event) => event.stopPropagation()}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}
