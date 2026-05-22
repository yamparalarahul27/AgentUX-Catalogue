// PARKED — per-dot random twinkle for toast mosaic.
//
// The randomness reads correctly (each dot blinks independently
// instead of the whole field pulsing in lockstep) but the visual
// feels too scattered — needs more polish before it ships:
//   - cluster the dots toward the corner instead of random spray
//   - weight dot sizes (smaller dots more common than large)
//   - tune the mask shape so the cluster has a clearer silhouette
//
// Reverted to the mask-based ::after mosaic in part-3-flow.scss /
// whats-new.scss until the polish lands. Uncomment the block below
// and re-import in AppUpdateToast.tsx + Toast.tsx to revive.
//
// Parked: 2026-05-23.

export {};

/*
import { useMemo } from 'react';

interface ToastMosaicProps {
  color: string;
  count?: number;
}

export function ToastMosaic({ color, count = 22 }: ToastMosaicProps) {
  const dots = useMemo(() => {
    return Array.from({ length: count }, () => ({
      left: 45 + Math.random() * 53,
      top: 4 + Math.random() * 51,
      size: 2.4 + Math.random() * 2.0,
      delay: -(Math.random() * 4),
      duration: 2.2 + Math.random() * 2.6,
    }));
  }, [count]);

  return (
    <div className="toast-mosaic" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="toast-mosaic__dot"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            background: color,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
*/
