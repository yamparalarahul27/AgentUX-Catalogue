// useDockMagnification — cursor-proximity magnification for the catalogue dock.
//
// Mirrors the buildui.com magnified-dock pattern (single radius for
// scale + nudge) computed on each animation frame. Sets --mag and
// --nudge CSS variables on each chip; the CSS transform consumes them.
//
// Tooltip triggering is handled separately by Radix Tooltip wrapping
// each chip (see components/CatalogueDockChip.tsx).
//
// Companion code:
//   - components/CatalogueMagnifiedDock.tsx
//   - styles/catalogue-magnified-dock.scss

import { useCallback, useEffect, useRef } from 'react';

const MAX_SCALE = 2.0;     // max scale at the cursor centre
const DISTANCE_PX = 110;   // radius within which a chip is affected
const NUDGE_PX = 32;       // horizontal slide-away magnitude

export interface UseDockMagnificationArgs {
  // Suppress magnification (e.g., during a page swap settle window).
  // When true: chip transforms reset to identity.
  suspended: boolean;
}

export interface UseDockMagnificationApi {
  // Attach to the dock-region element via ref callback.
  setDockRef: (el: HTMLElement | null) => void;
  // Attach to the dock pill (parent of chips). Magnification math
  // uses chips inside this element.
  setChipsContainerRef: (el: HTMLElement | null) => void;
  // Fire after the chip set changes (e.g., page swap) so the hook
  // re-applies magnification from the current cursor position.
  invalidate: () => void;
}

export function useDockMagnification({
  suspended,
}: UseDockMagnificationArgs): UseDockMagnificationApi {
  const dockRegionRef = useRef<HTMLElement | null>(null);
  const chipsContainerRef = useRef<HTMLElement | null>(null);
  // Cursor x relative to the dock pill's left edge. -Infinity = outside.
  const mouseLeftRef = useRef<number>(-Infinity);
  const pendingFrameRef = useRef<number | null>(null);
  const suspendedRef = useRef(suspended);

  useEffect(() => { suspendedRef.current = suspended; }, [suspended]);

  const applyMagnification = useCallback(() => {
    const container = chipsContainerRef.current;
    if (!container) return;
    const chips = container.querySelectorAll<HTMLElement>('[data-dock-chip]');
    if (chips.length === 0) return;
    const containerRect = container.getBoundingClientRect();
    const mouseLeft = mouseLeftRef.current;

    if (mouseLeft === -Infinity || suspendedRef.current) {
      chips.forEach((chip) => {
        chip.style.setProperty('--mag', '1');
        chip.style.setProperty('--nudge', '0px');
      });
      return;
    }

    chips.forEach((chip) => {
      const rect = chip.getBoundingClientRect();
      const center = (rect.left - containerRect.left) + rect.width / 2;
      const d = mouseLeft - center;
      const absD = Math.abs(d);

      const scale = absD >= DISTANCE_PX
        ? 1
        : 1 + (MAX_SCALE - 1) * (1 - absD / DISTANCE_PX);
      const nudge = absD >= DISTANCE_PX
        ? Math.sign(d) * -NUDGE_PX
        : (-d / DISTANCE_PX) * NUDGE_PX * scale;

      chip.style.setProperty('--mag', String(scale));
      chip.style.setProperty('--nudge', `${nudge}px`);
    });
  }, []);

  const schedule = useCallback(() => {
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      applyMagnification();
    });
  }, [applyMagnification]);

  // Stable mousemove/mouseleave handlers — defined once via refs so
  // removeEventListener actually matches the added handler across
  // StrictMode mount/unmount cycles.
  const handleMoveRef = useRef<(event: MouseEvent) => void>(() => {});
  const handleLeaveRef = useRef<() => void>(() => {});
  handleMoveRef.current = (event: MouseEvent) => {
    const container = chipsContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouseLeftRef.current = event.clientX - rect.left;
    schedule();
  };
  handleLeaveRef.current = () => {
    mouseLeftRef.current = -Infinity;
    schedule();
  };
  const onMove = useRef((event: MouseEvent) => handleMoveRef.current(event)).current;
  const onLeave = useRef(() => handleLeaveRef.current()).current;

  const setDockRef = useCallback((el: HTMLElement | null) => {
    if (dockRegionRef.current && dockRegionRef.current !== el) {
      dockRegionRef.current.removeEventListener('mousemove', onMove);
      dockRegionRef.current.removeEventListener('mouseleave', onLeave);
    }
    dockRegionRef.current = el;
    if (el) {
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
    }
  }, [onMove, onLeave]);

  const setChipsContainerRef = useCallback((el: HTMLElement | null) => {
    chipsContainerRef.current = el;
    schedule();
  }, [schedule]);

  // When suspension flips, re-apply immediately.
  useEffect(() => {
    schedule();
  }, [suspended, schedule]);

  // Cleanup on unmount — cancel pending rAF AND reset the ref so a
  // StrictMode remount doesn't see a stale pendingFrameRef and bail
  // every future schedule() call.
  useEffect(() => () => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
  }, []);

  return { setDockRef, setChipsContainerRef, invalidate: schedule };
}
