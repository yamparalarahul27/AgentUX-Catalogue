// Canvas-based crop: removes a horizontal slice from the top and/or bottom
// of an image, preserves the full width. Returns a PNG blob.

interface CropArgs {
  imageUrl: string;
  topTrim: number;
  bottomTrim: number;
  fileName: string;
}

interface CropResult {
  blob: Blob;
  file: File;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for crop'));
    img.src = url;
  });
}

export async function cropImageVertical({
  imageUrl,
  topTrim,
  bottomTrim,
  fileName,
}: CropArgs): Promise<CropResult> {
  const img = await loadImage(imageUrl);
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const top = Math.max(0, Math.min(Math.round(topTrim), naturalHeight));
  const bottom = Math.max(0, Math.min(Math.round(bottomTrim), naturalHeight));
  const cropHeight = Math.max(1, naturalHeight - top - bottom);

  const canvas = document.createElement('canvas');
  canvas.width = naturalWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(
    img,
    0, top, naturalWidth, cropHeight,
    0, 0, naturalWidth, cropHeight,
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Canvas toBlob returned null')),
      'image/png',
    );
  });

  const file = new File([blob], fileName, { type: 'image/png' });
  return {
    blob,
    file,
    width: naturalWidth,
    height: cropHeight,
    originalWidth: naturalWidth,
    originalHeight: naturalHeight,
  };
}
