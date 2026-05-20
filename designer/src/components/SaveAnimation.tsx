import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// Parabolic fly-to-Saved animation. A small thumbnail launches from
// wherever the user clicked Save and arcs up and over to the
// "Saved" filter button in the toolbar. iOS-app-downloads-to-Dock
// pattern, used here to make saves feel landed.
//
// Wiring:
//   1. Mount <SaveAnimationProvider> high in the tree (Catalogue.tsx).
//   2. The toolbar's Saved button calls registerTarget(ref) on mount.
//   3. Callers (card overlay, lightbox icon) call flyFromButton with
//      the clicked button + the screenshot's image_url. The thumb
//      animates from that button to the registered target.
//   4. If no target is registered (share page, group detail, etc.)
//      flyFromButton is a no-op — graceful skip.

interface FlyingItem {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  imageUrl: string;
}

interface SaveAnimationContextValue {
  registerTarget: (el: HTMLElement | null) => void;
  flyFromButton: (button: HTMLElement, imageUrl: string) => void;
}

const SaveAnimationContext = createContext<SaveAnimationContextValue | null>(null);

// Visual constants
const THUMB_SIZE = 64;
const ANIMATION_MS = 1150;

export function SaveAnimationProvider({ children }: { children: ReactNode }) {
  const targetRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState<FlyingItem[]>([]);
  const nextIdRef = useRef(1);

  const registerTarget = useCallback((el: HTMLElement | null) => {
    targetRef.current = el;
  }, []);

  const flyFromButton = useCallback((button: HTMLElement, imageUrl: string) => {
    const target = targetRef.current;
    if (!target || !button || !imageUrl) return;
    const sourceRect = button.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // Centre of source button → centre of target.
    const startX = sourceRect.left + sourceRect.width / 2 - THUMB_SIZE / 2;
    const startY = sourceRect.top + sourceRect.height / 2 - THUMB_SIZE / 2;
    const endX = targetRect.left + targetRect.width / 2 - THUMB_SIZE / 2;
    const endY = targetRect.top + targetRect.height / 2 - THUMB_SIZE / 2;
    const id = nextIdRef.current++;
    setItems((prev) => [...prev, { id, startX, startY, endX, endY, imageUrl }]);
  }, []);

  const handleDone = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <SaveAnimationContext.Provider value={{ registerTarget, flyFromButton }}>
      {children}
      {items.length > 0 && createPortal(
        <div className="save-animation-layer" aria-hidden="true">
          {items.map((item) => (
            <FlyingThumbnail key={item.id} item={item} onDone={handleDone} />
          ))}
        </div>,
        document.body,
      )}
    </SaveAnimationContext.Provider>
  );
}

export function useSaveAnimation(): SaveAnimationContextValue {
  const ctx = useContext(SaveAnimationContext);
  if (ctx) return ctx;
  // No provider — return no-op stubs so callers can call freely
  // without needing to know if the surface they're on has the
  // animation layer mounted (e.g. share page).
  return {
    registerTarget: () => {},
    flyFromButton: () => {},
  };
}

interface FlyingThumbnailProps {
  item: FlyingItem;
  onDone: (id: number) => void;
}

function FlyingThumbnail({ item, onDone }: FlyingThumbnailProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / ANIMATION_MS);
      setProgress(t);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // Brief settle before unmount so the landed frame is visible.
        window.setTimeout(() => onDone(item.id), 40);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item.id, onDone]);

  // ease-in-out for the chord (X + Y component) so the thumb
  // accelerates off the source and decelerates into the target.
  const ease = easeInOutCubic(progress);
  const x = item.startX + (item.endX - item.startX) * ease;
  const yLinear = item.startY + (item.endY - item.startY) * ease;
  // Parabolic apex: lifts the path up by ~140px at the midpoint.
  // sin(πt) peaks at t=0.5 with value 1.
  const apex = Math.sin(Math.PI * ease) * 140;
  const y = yLinear - apex;

  // Shrink + fade as we land, plus a gentle rotation for liveliness.
  const scale = 1 - 0.35 * ease;
  const rotate = -8 + 24 * ease;
  // Stay opaque until the last ~20%, then fade out.
  const opacity = ease < 0.8 ? 1 : 1 - (ease - 0.8) / 0.2;

  return (
    <img
      src={item.imageUrl}
      alt=""
      className="save-animation-thumb"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`,
        transformOrigin: 'center center',
        opacity,
        objectFit: 'cover',
        borderRadius: 8,
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.18)',
        pointerEvents: 'none',
        zIndex: 1500,
        willChange: 'transform, opacity',
      }}
    />
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
