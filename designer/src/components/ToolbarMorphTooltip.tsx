import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { IconTooltip } from './IconTooltip';

// Shared morphing tooltip for a contiguous row of icon buttons (the
// toolbar-right cluster: Search / Share / Saved). One label pill is
// anchored beneath whichever button is hovered or focused; moving to an
// adjacent button slides + resizes the *same* element rather than fading
// one tooltip out and another in. Styled via .catalogue-morph-tooltip in
// catalogue-toolbar-morph-tooltip.scss.
//
// This is a pointer/keyboard enhancement only. Touch and reduced-motion
// environments never activate it (see useMorphTooltip's capability gate)
// — there, callers fall back to the per-button Radix IconTooltip so the
// accessible behaviour is unchanged.

const DATA_ATTR = 'data-morph-label';

interface PillState {
  label: string;
  // Pill center, in pixels relative to the cluster container's left edge.
  // Clamped so the pill never runs past the viewport (no collision lib).
  centerX: number;
  // How far the arrow shifts from the pill's center to keep pointing at the
  // button after the pill was clamped. 0 when the pill sits centered.
  arrowOffset: number;
  width: number;
  visible: boolean;
}

const HIDDEN: PillState = { label: '', centerX: 0, arrowOffset: 0, width: 0, visible: false };

// Keep the pill (and its arrow) this far from the viewport edge.
const VIEWPORT_PADDING = 8;

export interface MorphTooltipController {
  /** Whether the morph layer is live (flag on + capable environment). */
  active: boolean;
  /** Props to spread onto the cluster container element. */
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    onPointerOver: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: (e: React.FocusEvent) => void;
  };
  /** The pill + hidden measurer to render once inside the container. */
  overlay: ReactElement | null;
}

export function useMorphTooltip(enabled: boolean): MorphTooltipController {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [capable, setCapable] = useState(false);
  const [pill, setPill] = useState<PillState>(HIDDEN);

  // Capability gate: only mouse-like pointers with motion allowed. Touch
  // (pointer: coarse) and prefers-reduced-motion keep the Radix fallback.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) {
      setCapable(false);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setCapable(!reduce.matches && !coarse.matches);
    update();
    reduce.addEventListener('change', update);
    coarse.addEventListener('change', update);
    return () => {
      reduce.removeEventListener('change', update);
      coarse.removeEventListener('change', update);
    };
  }, [enabled]);

  const showFor = useCallback((btn: HTMLElement) => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;
    const label = btn.getAttribute(DATA_ATTR);
    if (!label) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    measurer.textContent = label;
    const width = measurer.offsetWidth;
    const half = width / 2;
    // Ideal: pill centered on the button. Clamp to the viewport so an
    // edge-adjacent cluster (e.g. the header's top-right icons) never
    // renders a half-clipped pill, then nudge the arrow back onto the
    // button. Arrow stays within the pill body (6px inset).
    const buttonCenter = bRect.left + bRect.width / 2;
    const min = VIEWPORT_PADDING + half;
    const max = window.innerWidth - VIEWPORT_PADDING - half;
    const clampedCenter = max < min ? buttonCenter : Math.min(Math.max(buttonCenter, min), max);
    const arrowOffset = Math.max(-(half - 6), Math.min(half - 6, buttonCenter - clampedCenter));
    setPill({
      label,
      centerX: clampedCenter - cRect.left,
      arrowOffset,
      width,
      visible: true,
    });
  }, []);

  const hide = useCallback(() => {
    setPill((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const labelledButton = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>(`[${DATA_ATTR}]`);
  };

  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const btn = labelledButton(e.target);
      if (btn) showFor(btn);
    },
    [showFor],
  );

  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      const btn = labelledButton(e.target);
      if (btn) showFor(btn);
    },
    [showFor],
  );

  const onBlur = useCallback(
    (e: React.FocusEvent) => {
      const container = containerRef.current;
      // Keep the pill while focus moves between buttons in the cluster.
      if (container && e.relatedTarget instanceof Node && container.contains(e.relatedTarget)) {
        return;
      }
      hide();
    },
    [hide],
  );

  const overlay = capable ? (
    <>
      <span ref={measureRef} className="catalogue-morph-tooltip__measure" aria-hidden="true" />
      <div
        className="catalogue-morph-tooltip"
        data-visible={pill.visible ? 'true' : 'false'}
        aria-hidden="true"
        style={{
          width: `${pill.width}px`,
          transform: `translate(${pill.centerX}px, 0) translateX(-50%) scale(${pill.visible ? 1 : 0.96})`,
          ['--morph-arrow-offset' as string]: `${pill.arrowOffset}px`,
        }}
      >
        {pill.label}
      </div>
    </>
  ) : null;

  return {
    active: capable,
    containerProps: { ref: containerRef, onPointerOver, onPointerLeave: hide, onFocus, onBlur },
    overlay,
  };
}

// Wraps a single icon button. When the morph layer is active it tags the
// button with the data attribute the cluster delegates on and drops the
// Radix tooltip (the shared pill covers it). Otherwise it falls back to
// the standard IconTooltip, so non-morph environments are untouched.
export function MorphTooltipButton({
  label,
  active,
  side,
  sideOffset,
  children,
}: {
  label: string;
  active: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  children: ReactElement;
}) {
  if (active) {
    return cloneElement(children as ReactElement<Record<string, unknown>>, { [DATA_ATTR]: label });
  }
  return (
    <IconTooltip label={label} side={side} sideOffset={sideOffset}>
      {children}
    </IconTooltip>
  );
}
