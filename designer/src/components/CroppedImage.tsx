import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface CroppedImageProps {
  src: string;
  // bbox: [x, y, w, h] in percent 0-100 (top-left origin).
  bbox: [number, number, number, number];
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

interface ImgStyle {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
}

// Render only the bbox region of a source image, FIT inside the
// container (letterbox around the cropped region) while preserving
// the image's natural aspect ratio.
//
// Why JS measurement instead of pure CSS: background-size percentages
// scale width and height independently relative to the container. In
// a non-square container (the elements detail-page tiles are portrait
// 9:16), `background-size: X% X%` stretches the image to match the
// container's aspect. We need the IMAGE'S natural pixel aspect ratio
// to compute a correct uniform scale. Reading naturalWidth/Height on
// load + ResizeObserver on the container is the cleanest path.
//
// Layout:
//  - container: position relative, overflow hidden, fills given size
//  - <img>: position absolute, sized in px so bbox fits container with
//    aspect preserved, positioned so bbox center is at container center
export function CroppedImage({ src, bbox, alt, className, style }: CroppedImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgStyle, setImgStyle] = useState<ImgStyle | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const [bx, by, bw, bh] = bbox;
    const safeBw = Math.max(0.01, bw);
    const safeBh = Math.max(0.01, bh);

    function recompute() {
      if (!container || !img) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;
      if (cw === 0 || ch === 0 || iw === 0 || ih === 0) return;

      // Bbox dimensions in pixels (relative to natural image).
      const bboxWpx = (safeBw / 100) * iw;
      const bboxHpx = (safeBh / 100) * ih;
      // Uniform scale so the bbox fits inside the container preserving
      // aspect. min(cw/bboxW, ch/bboxH) picks whichever dimension
      // would overflow first.
      const scale = Math.min(cw / bboxWpx, ch / bboxHpx);
      const displayW = iw * scale;
      const displayH = ih * scale;
      // Position the image so the bbox center sits at the container
      // center. The bbox center in displayed image coords:
      //   bxCenterPx = (bx + bw/2)/100 × displayW
      //   byCenterPx = (by + bh/2)/100 × displayH
      // We want this point at (cw/2, ch/2) within the container.
      const bxCenter = ((bx + safeBw / 2) / 100) * displayW;
      const byCenter = ((by + safeBh / 2) / 100) * displayH;
      const left = cw / 2 - bxCenter;
      const top = ch / 2 - byCenter;
      setImgStyle({
        position: 'absolute',
        left,
        top,
        width: displayW,
        height: displayH,
      });
    }

    function onLoad() {
      recompute();
    }
    if (img.complete && img.naturalWidth > 0) recompute();
    else img.addEventListener('load', onLoad);

    const observer = new ResizeObserver(recompute);
    observer.observe(container);

    return () => {
      observer.disconnect();
      img.removeEventListener('load', onLoad);
    };
  }, [bbox, src]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0a0c',
        ...style,
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ''}
        // Hide until we've measured + positioned so we never flash a
        // stretched/mispositioned frame.
        style={imgStyle ? { ...imgStyle, maxWidth: 'none', maxHeight: 'none' } : { visibility: 'hidden' }}
        draggable={false}
      />
    </div>
  );
}
