import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import floppyImg from '../assets/save-and-bin/floppy.png';
import trashEmptyImg from '../assets/save-and-bin/trash-empty.png';
import trashFullImg from '../assets/save-and-bin/trash-full.png';

// Public API — triggered by the catalogue grid card + lightbox when
// the user saves (bookmarks) or deletes a screenshot. The screenshot
// rendered above the rest of the page via a portal, choreographed
// with CSS keyframes only (no animation library).
type AnimationKind = 'save' | 'delete';

interface AnimationRequest {
  sourceRect: DOMRect;
  // Public image URL of the screenshot — used as the moving element.
  // Falls back gracefully if absent (we render a neutral surface).
  screenshotUrl: string | null;
  thumbHash?: string | null;
  // Fires when the animation visually completes. Callers should
  // perform the underlying mutation (toggleBookmark / softDelete)
  // inside onComplete so the data change matches the visual landing.
  onComplete?: () => void;
}

interface ActiveAnimation extends AnimationRequest {
  id: string;
  kind: AnimationKind;
}

interface SaveTrashAnimationContextValue {
  triggerSave: (request: AnimationRequest) => void;
  triggerDelete: (request: AnimationRequest) => void;
}

const SaveTrashAnimationContext = createContext<SaveTrashAnimationContextValue | null>(null);

export function useSaveTrashAnimation(): SaveTrashAnimationContextValue {
  const value = useContext(SaveTrashAnimationContext);
  if (!value) {
    throw new Error('useSaveTrashAnimation must be used inside SaveTrashAnimationProvider');
  }
  return value;
}

interface SaveTrashAnimationProviderProps {
  children: ReactNode;
}

let nextAnimationId = 0;

export function SaveTrashAnimationProvider({ children }: SaveTrashAnimationProviderProps) {
  const [active, setActive] = useState<ActiveAnimation[]>([]);

  const dismiss = useCallback((id: string) => {
    setActive((previous) => previous.filter((animation) => animation.id !== id));
  }, []);

  const trigger = useCallback((kind: AnimationKind, request: AnimationRequest) => {
    nextAnimationId += 1;
    const id = `anim-${nextAnimationId}`;
    setActive((previous) => [...previous, { ...request, id, kind }]);
  }, []);

  const triggerSave = useCallback(
    (request: AnimationRequest) => trigger('save', request),
    [trigger],
  );
  const triggerDelete = useCallback(
    (request: AnimationRequest) => trigger('delete', request),
    [trigger],
  );

  const value = useMemo<SaveTrashAnimationContextValue>(
    () => ({ triggerSave, triggerDelete }),
    [triggerSave, triggerDelete],
  );

  return (
    <SaveTrashAnimationContext.Provider value={value}>
      {children}
      {active.map((animation) => (
        <AnimationStage
          key={animation.id}
          animation={animation}
          onDismiss={() => dismiss(animation.id)}
        />
      ))}
    </SaveTrashAnimationContext.Provider>
  );
}

interface AnimationStageProps {
  animation: ActiveAnimation;
  onDismiss: () => void;
}

// Total durations — must match the keyframes in save-trash-animation.scss.
const SAVE_TOTAL_MS = 1500;
// Delete keeps the ball/screenshot animation at 1.6s, but the trash
// asset lingers visible after the impact for ~900ms (so the "full"
// trash is a clear "you deleted this" moment) before sliding out.
const DELETE_TOTAL_MS = 2400;
// Commit at the moment the screenshot has visually arrived in the
// corner asset — bookmark toggles / soft-delete fires.
const SAVE_COMMIT_AT_MS = 1100;
const DELETE_TRASH_SWAP_AT_MS = 1050;
// Visual placement of the corner asset (viewport-relative). 32px
// inset from the edge feels grounded — anchors the asset to the
// "floor" without crowding the corner.
const CORNER_INSET = 32;
// Rendered size of the corner asset.
const CORNER_ASSET_SIZE = 132;
// Visual size of the shrunken thumbnail at the moment it lands
// inside the corner asset. The screenshot keeps its aspect ratio —
// uniform scale shrinks the longest side to THUMB_SIZE, the shorter
// side proportionally smaller.
const THUMB_SIZE = 64;
// Vertical lift at the apex of the delete arc. Negative = up.
// Pulls the thumb above the straight-line midpoint so the path
// reads as a real toss into the bin, not a slide.
const DELETE_ARC_LIFT = -70;

function AnimationStage({ animation, onDismiss }: AnimationStageProps) {
  const reducedMotion = useReducedMotion();
  const [trashIsFull, setTrashIsFull] = useState(false);
  const commitFiredRef = useRef(false);

  const totalDuration = reducedMotion
    ? 280
    : animation.kind === 'save' ? SAVE_TOTAL_MS : DELETE_TOTAL_MS;

  useEffect(() => {
    if (reducedMotion) {
      const completeTimer = window.setTimeout(() => animation.onComplete?.(), 80);
      const dismissTimer = window.setTimeout(onDismiss, 280);
      return () => {
        window.clearTimeout(completeTimer);
        window.clearTimeout(dismissTimer);
      };
    }

    let commitTimer: number | null = null;
    let swapTimer: number | null = null;

    if (animation.kind === 'save') {
      commitTimer = window.setTimeout(() => {
        if (commitFiredRef.current) return;
        commitFiredRef.current = true;
        animation.onComplete?.();
      }, SAVE_COMMIT_AT_MS);
    } else {
      swapTimer = window.setTimeout(() => setTrashIsFull(true), DELETE_TRASH_SWAP_AT_MS);
      commitTimer = window.setTimeout(() => {
        if (commitFiredRef.current) return;
        commitFiredRef.current = true;
        animation.onComplete?.();
      }, DELETE_TRASH_SWAP_AT_MS);
    }

    const dismissTimer = window.setTimeout(onDismiss, totalDuration);

    return () => {
      if (commitTimer) window.clearTimeout(commitTimer);
      if (swapTimer) window.clearTimeout(swapTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [animation, onDismiss, reducedMotion, totalDuration]);

  const { sourceRect, screenshotUrl, kind } = animation;

  // Compute the translation delta from the source rect's centre to
  // the corner asset's centre. The CSS keyframe ends with a transform
  // that uses these vars so the screenshot lands exactly inside the
  // corner asset regardless of where on the page it started.
  const sourceCenterX = sourceRect.left + sourceRect.width / 2;
  const sourceCenterY = sourceRect.top + sourceRect.height / 2;
  const cornerCenterY = window.innerHeight - CORNER_INSET - CORNER_ASSET_SIZE / 2;
  const cornerCenterX = kind === 'save'
    ? CORNER_INSET + CORNER_ASSET_SIZE / 2
    : window.innerWidth - CORNER_INSET - CORNER_ASSET_SIZE / 2;
  const deltaX = cornerCenterX - sourceCenterX;
  const deltaY = cornerCenterY - sourceCenterY;
  // Uniform shrink factor — scales the longest side of the source
  // rect down to THUMB_SIZE so the shrunken thumb fits within a
  // THUMB_SIZE box while preserving aspect ratio.
  const thumbScale = THUMB_SIZE / Math.max(sourceRect.width, sourceRect.height);
  // Apex of the parabolic arc (delete only) — halfway across and
  // lifted up. Smooth ease-in-out between source → apex → target
  // produces a curve without the kink that more keyframes introduce.
  const apexX = deltaX * 0.5;
  const apexY = deltaY * 0.5 + DELETE_ARC_LIFT;

  const stageStyle: React.CSSProperties & Record<string, string> = {
    '--anim-dx': `${deltaX}px`,
    '--anim-dy': `${deltaY}px`,
    '--thumb-scale': String(thumbScale),
    '--apex-dx': `${apexX}px`,
    '--apex-dy': `${apexY}px`,
  };

  const screenshotStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${sourceRect.top}px`,
    left: `${sourceRect.left}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
  };

  const cornerAssetStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: `${CORNER_INSET}px`,
    width: `${CORNER_ASSET_SIZE}px`,
    height: 'auto',
    ...(kind === 'save' ? { left: `${CORNER_INSET}px` } : { right: `${CORNER_INSET}px` }),
  };

  return createPortal(
    <div className={`save-trash-anim save-trash-anim--${kind}${reducedMotion ? ' is-reduced' : ''}`} style={stageStyle} aria-hidden="true">
      <div className="save-trash-anim__screenshot" style={screenshotStyle}>
        {screenshotUrl ? (
          <img src={screenshotUrl} alt="" draggable={false} />
        ) : (
          <div className="save-trash-anim__screenshot-fallback" />
        )}
      </div>

      {kind === 'save' && (
        <img
          src={floppyImg}
          alt=""
          draggable={false}
          className="save-trash-anim__floppy"
          style={cornerAssetStyle}
        />
      )}

      {kind === 'delete' && (
        <img
          src={trashIsFull ? trashFullImg : trashEmptyImg}
          alt=""
          draggable={false}
          className={`save-trash-anim__trash${trashIsFull ? ' is-full' : ''}`}
          style={cornerAssetStyle}
        />
      )}
    </div>,
    document.body,
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}
