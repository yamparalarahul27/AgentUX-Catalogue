import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  MutableRefObject,
  RefCallback,
} from 'react';
import { useCallback } from 'react';

import { useSquircle } from '../hooks/use-squircle';

type SquircleProps<T extends ElementType> = {
  as?: T;
  cornerRadius: number;
  cornerSmoothing?: number;
  // Optional escape hatch — set to false to disable the mask (e.g. when a
  // feature flag is off). The caller's existing CSS border-radius shows
  // through unchanged.
  squircle?: boolean;
  style?: CSSProperties;
  // Forwarded ref to the underlying DOM element. Lets callers attach
  // their own ref alongside the squircle mask hook. Mounted via a
  // callback ref that fans the node out to both — pass a stable ref
  // (`useRef`) to avoid re-mounts.
  innerRef?: MutableRefObject<HTMLElement | null> | RefCallback<HTMLElement | null>;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'style' | 'innerRef'>;

// Renders any element with a Figma-quality squircle clip-path applied. Drop-in
// replacement for `<button>`, `<div>`, `<input>` — just add `cornerRadius`.
// The mask re-computes on resize via ResizeObserver inside the hook.
export function Squircle<T extends ElementType = 'div'>({
  as,
  cornerRadius,
  cornerSmoothing,
  squircle = true,
  style,
  innerRef,
  ...rest
}: SquircleProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const { ref: squircleRef, clipPath } = useSquircle<HTMLElement>({
    cornerRadius,
    cornerSmoothing,
    enabled: squircle,
  });
  // Fan the DOM node out to both the squircle's internal ref and the
  // caller's innerRef (if provided). Stable under useCallback so React
  // doesn't re-fire on every render.
  const setRef = useCallback((node: HTMLElement | null) => {
    squircleRef.current = node;
    if (!innerRef) return;
    if (typeof innerRef === 'function') innerRef(node);
    else innerRef.current = node;
  }, [squircleRef, innerRef]);
  return <Component ref={setRef} style={{ ...style, clipPath }} {...(rest as object)} />;
}
