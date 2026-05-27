import { DotmSquare11 } from './loaders/dotm-square-11';

// Thin wrapper around the Echo Ring loader (DotmSquare11) from
// dotmatrix.zzzzshawn.cloud. Vendored under loaders/ + the CSS at
// styles/dotmatrix-loader.css. We use Echo Ring everywhere — single
// loader aesthetic across buttons, comments-loading, lightbox
// "loading next", etc.
//
// Sizes:
//   sm  — 14px, sits inline with body text inside buttons
//   md  — 22px, replaces small `.loading-spinner` rings
//   lg  — 32px, full-area loading states
//
// Color inherits via `currentColor` so the loader picks up the
// surrounding button / text colour automatically.

type DotLoaderSize = 'sm' | 'md' | 'lg';

interface DotLoaderProps {
  size?: DotLoaderSize;
  ariaLabel?: string;
  className?: string;
}

const SIZE_PX: Record<DotLoaderSize, number> = {
  sm: 14,
  md: 22,
  lg: 32,
};

// 5×5 grid math: matrixSpan = dotSize·5 + gap·4. The loader's default
// dotSize=5 wants a 29px wrapper minimum — at sm/md our wrapper is
// smaller, so the dots overflow and clip to a rectangle. Pair each
// preset with a dotSize that keeps the grid inside the wrapper.
const DOT_PX: Record<DotLoaderSize, number> = {
  sm: 2,
  md: 3,
  lg: 4,
};

export function DotLoader({ size = 'md', ariaLabel = 'Loading', className }: DotLoaderProps) {
  return (
    <DotmSquare11
      size={SIZE_PX[size]}
      dotSize={DOT_PX[size]}
      ariaLabel={ariaLabel}
      className={className}
      color="currentColor"
      // Subtle motion — too fast feels frantic next to a Save button.
      speed={1.1}
    />
  );
}
