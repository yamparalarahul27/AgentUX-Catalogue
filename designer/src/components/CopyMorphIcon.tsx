import { useCallback, useEffect, useRef, useState } from 'react';

// Hook + visual component for the "copy confirmation" pattern.
//
// Pattern: user clicks a copy-style button. The icon morphs from
// its default (Copy / Share) to a Check, cross-fading, holds for a
// brief beat, then morphs back. Visual feedback that the click
// landed — replaces the dependence on a toast that gets blocked by
// the lightbox / sits at the bottom of the page where eyes don't
// follow.

const CONFIRMATION_MS = 1400;

export function useCopyConfirmation(): {
  justCopied: boolean;
  confirm: () => void;
} {
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const confirm = useCallback(() => {
    setJustCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
      timerRef.current = null;
    }, CONFIRMATION_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return { justCopied, confirm };
}

interface CopyMorphIconProps {
  // The default-state icon (Copy, Share2, etc.).
  defaultIcon: React.ReactNode;
  // The success-state icon (typically Check). Receives an
  // accent-success colour from the parent button via currentColor.
  confirmedIcon: React.ReactNode;
  // True when the copy has just landed — drives the cross-fade.
  justCopied: boolean;
  // Pixel size so the wrapper reserves vertical space and the icons
  // stay centred during the swap.
  size: number;
}

export function CopyMorphIcon({ defaultIcon, confirmedIcon, justCopied, size }: CopyMorphIconProps) {
  return (
    <span
      className="copy-morph"
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        // Avoid the button shrinking the icon's footprint mid-morph.
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: justCopied ? 0 : 1,
          transform: justCopied ? 'scale(0.6)' : 'scale(1)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        {defaultIcon}
      </span>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Lands with a tiny pop — eases from 0.6 → 1.0.
          opacity: justCopied ? 1 : 0,
          transform: justCopied ? 'scale(1)' : 'scale(0.6)',
          transition: 'opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
          color: justCopied ? '#22c55e' : 'inherit',
        }}
      >
        {confirmedIcon}
      </span>
    </span>
  );
}
