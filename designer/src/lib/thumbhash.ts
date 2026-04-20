import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';

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
