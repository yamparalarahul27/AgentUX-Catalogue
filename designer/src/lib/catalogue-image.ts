export function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }

    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(image.src);
      if (image.width <= maxWidth && file.size < 300_000) {
        resolve(file);
        return;
      }

      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/webp' }) : file),
        'image/webp',
        quality,
      );
    };
    image.onerror = () => resolve(file);
    image.src = URL.createObjectURL(file);
  });
}
