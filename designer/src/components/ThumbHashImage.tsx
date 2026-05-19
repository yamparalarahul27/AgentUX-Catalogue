import { useMemo, useState } from 'react';
import { thumbHashToUrl } from '../lib/thumbhash';

interface Props {
  src: string;
  thumbHash: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export function ThumbHashImage({
  src,
  thumbHash,
  alt,
  className,
  style,
  draggable = false,
  onLoad,
  onError,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const placeholderUrl = useMemo(() => {
    if (!thumbHash) return null;
    try {
      return thumbHashToUrl(thumbHash);
    } catch {
      return null;
    }
  }, [thumbHash]);

  function handleLoad() {
    setLoaded(true);
    onLoad?.();
  }

  function handleError() {
    setErrored(true);
    onError?.();
  }

  if (errored || !src) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {placeholderUrl && !loaded && (
        <img
          src={placeholderUrl}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(4px)',
            transform: 'scale(1.05)',
          }}
        />
      )}
      <img
        src={src}
        alt={alt}
        draggable={draggable}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          // Auto-size to the image's natural dimensions, capped to the
          // container. With the parent set as flex centred, the <img>
          // becomes its own bounding box — letterbox bars no longer
          // belong to the element, so callers that put a border /
          // shadow on the <img> wrap just the visible screenshot.
          position: 'relative',
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          display: 'block',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
        }}
      />
    </div>
  );
}
