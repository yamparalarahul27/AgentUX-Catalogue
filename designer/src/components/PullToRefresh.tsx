import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Swipe-down-to-refresh for touch devices. Mounted once at the app root so
// it covers every section; the page scrolls at the document level (the
// toolbar is position:sticky), so we arm the gesture only while the
// document is scrolled to the very top.
//
// Works in both contexts:
//   · Installed home-screen app (standalone PWA) — there is no browser
//     chrome and therefore no native pull-to-refresh, so this fills the gap.
//   · Mobile browser tab — `overscroll-behavior-y: contain` (see
//     catalogue-pull-to-refresh.scss) plus preventDefault on the owned
//     gesture suppress the browser's own pull-to-refresh so the two don't
//     double-fire.
//
// Release past the threshold triggers a full reload, which refreshes every
// section uniformly and, on the installed app, also picks up a new build.

const THRESHOLD = 72;       // px of pull past which release triggers a refresh
const MAX_PULL = 120;       // clamp on how far the indicator travels
const RESISTANCE = 0.5;     // finger-to-indicator damping (rubber-band feel)
const VERTICAL_SLOP = 8;    // ignore tiny / mostly-horizontal moves before arming

function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

function atScrollTop(): boolean {
  const el = document.scrollingElement || document.documentElement;
  return (el?.scrollTop ?? window.scrollY) <= 0;
}

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs mirror the values the touch handlers read, so the listeners can be
  // attached once (empty deps) instead of re-binding on every pull tick.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTouchDevice()) return undefined;

    const setPullDist = (distance: number) => {
      pullRef.current = distance;
      setPull(distance);
    };

    function onTouchStart(event: TouchEvent) {
      if (refreshingRef.current || event.touches.length !== 1 || !atScrollTop()) {
        startYRef.current = null;
        return;
      }
      startXRef.current = event.touches[0].clientX;
      startYRef.current = event.touches[0].clientY;
      draggingRef.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (refreshingRef.current || startYRef.current === null) return;
      const dy = event.touches[0].clientY - startYRef.current;
      const dx = event.touches[0].clientX - startXRef.current;

      // Decide intent before owning the gesture: only a clearly-downward
      // drag at the top arms the pull. Upward or horizontal moves release
      // back to the browser (vertical scroll, horizontal filter strips).
      if (!draggingRef.current) {
        if (dy <= VERTICAL_SLOP) {
          if (dy < -VERTICAL_SLOP || Math.abs(dx) > VERTICAL_SLOP) startYRef.current = null;
          return;
        }
        if (Math.abs(dx) > dy || !atScrollTop()) {
          startYRef.current = null;
          return;
        }
        draggingRef.current = true;
      }

      // The user scrolled back up under us — let go.
      if (!atScrollTop()) {
        draggingRef.current = false;
        startYRef.current = null;
        setPullDist(0);
        return;
      }

      // We own the gesture: stop native scroll / rubber-band / pull-to-refresh.
      event.preventDefault();
      setPullDist(Math.min(MAX_PULL, (dy - VERTICAL_SLOP) * RESISTANCE));
    }

    function onTouchEnd() {
      if (!draggingRef.current) {
        startYRef.current = null;
        return;
      }
      const reached = pullRef.current >= THRESHOLD;
      draggingRef.current = false;
      startYRef.current = null;

      if (reached) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDist(THRESHOLD);
        // Brief spin so the gesture reads as acknowledged before the reload.
        window.setTimeout(() => window.location.reload(), 350);
      } else {
        setPullDist(0);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const ready = pull >= THRESHOLD;
  const dragging = draggingRef.current && !refreshing;
  const offset = refreshing ? THRESHOLD : pull;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      className="catalogue-ptr"
      role="status"
      aria-hidden={!refreshing}
      style={{
        transform: `translateX(-50%) translateY(${offset}px)`,
        opacity: offset > 0 ? 1 : 0,
        transition: dragging ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
      }}
    >
      <div className={`catalogue-ptr__spinner${ready ? ' is-ready' : ''}${refreshing ? ' is-refreshing' : ''}`}>
        <RefreshCw
          size={18}
          aria-hidden="true"
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
