import type { ComponentPropsWithoutRef, CSSProperties, ElementType } from 'react';

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
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'style'>;

// Renders any element with a Figma-quality squircle clip-path applied. Drop-in
// replacement for `<button>`, `<div>`, `<input>` — just add `cornerRadius`.
// The mask re-computes on resize via ResizeObserver inside the hook.
export function Squircle<T extends ElementType = 'div'>({
  as,
  cornerRadius,
  cornerSmoothing,
  squircle = true,
  style,
  ...rest
}: SquircleProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const { ref, clipPath } = useSquircle<HTMLElement>({
    cornerRadius,
    cornerSmoothing,
    enabled: squircle,
  });
  return <Component ref={ref} style={{ ...style, clipPath }} {...(rest as object)} />;
}
