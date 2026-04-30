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
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
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
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
        }}
      />
    </div>
  );
}
