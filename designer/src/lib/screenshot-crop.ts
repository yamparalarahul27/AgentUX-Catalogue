// Canvas-based crop: removes slices from any side of an image. Returns a PNG blob.

interface CropArgs {
  imageUrl: string;
  topTrim: number;
  bottomTrim: number;
  leftTrim: number;
  rightTrim: number;
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

export async function cropImageBox({
  imageUrl,
  topTrim,
  bottomTrim,
  leftTrim,
  rightTrim,
  fileName,
}: CropArgs): Promise<CropResult> {
  const img = await loadImage(imageUrl);
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const top = Math.max(0, Math.min(Math.round(topTrim), naturalHeight));
  const bottom = Math.max(0, Math.min(Math.round(bottomTrim), naturalHeight));
  const left = Math.max(0, Math.min(Math.round(leftTrim), naturalWidth));
  const right = Math.max(0, Math.min(Math.round(rightTrim), naturalWidth));
  const cropWidth = Math.max(1, naturalWidth - left - right);
  const cropHeight = Math.max(1, naturalHeight - top - bottom);

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(
    img,
    left, top, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight,
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
    width: cropWidth,
    height: cropHeight,
    originalWidth: naturalWidth,
    originalHeight: naturalHeight,
  };
}
