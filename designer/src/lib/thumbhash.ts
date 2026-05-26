import { rgbaToThumbHash, thumbHashToDataURL, thumbHashToRGBA } from 'thumbhash';

const THUMB_SIZE = 100;

export async function generateThumbHash(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const aspect = bitmap.width / bitmap.height;
  const w = aspect >= 1 ? THUMB_SIZE : Math.round(THUMB_SIZE * aspect);
  const h = aspect >= 1 ? Math.round(THUMB_SIZE / aspect) : THUMB_SIZE;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const pixels = ctx.getImageData(0, 0, w, h);
  const hash = rgbaToThumbHash(w, h, pixels.data);
  return uint8ToBase64(hash);
}

export function thumbHashToUrl(base64Hash: string): string {
  const hash = base64ToUint8(base64Hash);
  return thumbHashToDataURL(hash);
}

// Re-rasterizes the thumbhash through a coarse grid (default 20 cells
// along the longer dimension, shorter dim derived from aspect) so an
// upscale with `image-rendering: pixelated` shows discrete chunky
// cells — not the smooth DCT decode that `thumbHashToUrl` returns at
// its native ~32px size. Used by the lightbox placeholder.
//
// Sizing off the longer dimension keeps grid density consistent across
// portrait (mobile) and landscape (web) — fixing cols-only would give
// wide screenshots too few rows and lose the visible grid texture.
export function thumbHashToPixelatedUrl(base64Hash: string, targetLong = 20): string {
  const hash = base64ToUint8(base64Hash);
  const { w, h, rgba } = thumbHashToRGBA(hash);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d')!;
  const imageData = srcCtx.createImageData(w, h);
  imageData.data.set(rgba);
  srcCtx.putImageData(imageData, 0, 0);

  const aspect = w / h;
  let targetW: number;
  let targetH: number;
  if (w >= h) {
    targetW = targetLong;
    targetH = Math.max(2, Math.round(targetLong / aspect));
  } else {
    targetH = targetLong;
    targetW = Math.max(2, Math.round(targetLong * aspect));
  }

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetW;
  dstCanvas.height = targetH;
  const dstCtx = dstCanvas.getContext('2d')!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);

  return dstCanvas.toDataURL('image/png');
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
