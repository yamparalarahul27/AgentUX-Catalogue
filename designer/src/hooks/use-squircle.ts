import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_SMOOTHING, squircleClipPath } from '../lib/squircle';

interface UseSquircleArgs {
  // Corner radius in pixels. Matches what you'd put in `border-radius`.
  cornerRadius: number;
  // Figma's "smoothing" factor (0..1). 0.6 is the visual default in Figma
  // and most design systems; lower = more circular, higher = more pinched.
  cornerSmoothing?: number;
  // Disable the mask conditionally (e.g. when a feature flag is off). When
  // disabled the hook still returns a ref but the clipPath stays empty so
  // the element's CSS `border-radius` shows through unchanged.
  enabled?: boolean;
}

// Squircle-mask an element by attaching the returned ref. Re-applies whenever
// the element's size changes (so it survives resize, font-size changes, and
// late-loading content like images). When the element is too small to render
// a usable squircle, the hook returns an empty clipPath and the caller's CSS
// `border-radius` takes over — keep the fallback radius set for safety.
export function useSquircle<T extends HTMLElement>({
  cornerRadius,
  cornerSmoothing = DEFAULT_SMOOTHING,
  enabled = true,
}: UseSquircleArgs) {
  const ref = useRef<T | null>(null);
  const [clipPath, setClipPath] = useState<string>('');

  const recompute = useCallback(() => {
    const node = ref.current;
    if (!node || !enabled) {
      setClipPath('');
      return;
    }
    const { width, height } = node.getBoundingClientRect();
    const next = squircleClipPath({
      width: Math.round(width),
      height: Math.round(height),
      cornerRadius,
      cornerSmoothing,
    });
    setClipPath(next ?? '');
  }, [cornerRadius, cornerSmoothing, enabled]);

  useEffect(() => {
    if (!enabled) {
      setClipPath('');
      return undefined;
    }
    const node = ref.current;
    if (!node) return undefined;
    recompute();
    const observer = new ResizeObserver(() => recompute());
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, recompute]);

  return { ref, clipPath };
}
