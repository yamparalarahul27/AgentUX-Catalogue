import { getSvgPath } from 'figma-squircle';

// Figma-quality squircle (superellipse) corner masks. We use clip-path with
// the generated SVG path instead of border-radius so the curvature transitions
// smoothly into each edge — closer to the Apple / iOS app icon shape than the
// circular arc that CSS border-radius draws.
//
// Smoothing is the "amount of squircle" applied. Figma's default is 0.6 and
// matches what most design tools ship. Below 0.4 the curve is barely
// distinguishable from a circle; above 0.8 it starts to feel pinched.

export const DEFAULT_SMOOTHING = 0.6;

export interface SquircleOptions {
  width: number;
  height: number;
  cornerRadius: number;
  cornerSmoothing?: number;
}

// Returns the inline clip-path value (already wrapped in `path(...)`) for a
// rectangle of the given dimensions and corner radius. Returns null when the
// box is too small to render a sensible squircle — caller should fall back to
// regular border-radius in that case.
export function squircleClipPath({
  width,
  height,
  cornerRadius,
  cornerSmoothing = DEFAULT_SMOOTHING,
}: SquircleOptions): string | null {
  if (width <= 0 || height <= 0) return null;
  if (cornerRadius <= 0) return null;
  const safeRadius = Math.min(cornerRadius, width / 2, height / 2);
  const d = getSvgPath({
    width,
    height,
    cornerRadius: safeRadius,
    cornerSmoothing,
  });
  return `path("${d}")`;
}
