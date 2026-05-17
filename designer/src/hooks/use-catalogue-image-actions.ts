import { useCallback } from 'react';

import { compressImage } from '../lib/catalogue-image';
import {
  deleteAnnotation,
  fetchAnnotationsForScreenshot,
  updateAnnotationGeometry,
} from '../lib/screenshot-annotations';
import { cropImageBox } from '../lib/screenshot-crop';
import { supabase } from '../lib/supabase';
import { generateThumbHash } from '../lib/thumbhash';
import type { ScreenshotNode } from '../types';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface UseCatalogueImageActionsArgs {
  screenshots: ScreenshotNode[];
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userId: string;
}

// Image manipulation handlers extracted from useCatalogueFamilyActions:
// replace (version-bumped re-upload), crop (replaces storage, re-projects
// annotations), and reference-image set/remove. All operate on a single
// screenshot by id.
export function useCatalogueImageActions({
  screenshots,
  setScreenshots,
  setToast,
  userId,
}: UseCatalogueImageActionsArgs) {
  const handleReplaceImage = useCallback(async (id: string, file: File) => {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) return;

    const { count } = await supabase
      .from('screenshot_versions')
      .select('*', { count: 'exact', head: true })
      .eq('screenshot_id', id);
    const nextVersion = (count ?? 0) + 1;

    await supabase.from('screenshot_versions').insert({
      screenshot_id: id,
      version_number: nextVersion,
      storage_path: screenshot.storage_path,
      file_name: screenshot.file_name,
    });

    const compressed = await compressImage(file);
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const storagePath = `${userId}/all-projects/${safeName}`;
    const { error } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

    if (error) {
      setToast({ message: `Upload failed: ${error.message}`, type: 'error' });
      return;
    }

    const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
    await supabase.from('screenshots').update({ storage_path: storagePath, file_name: file.name }).eq('id', id);

    setScreenshots((previous) => previous.map((item) => (
      item.id === id
        ? { ...item, storage_path: storagePath, file_name: file.name, image_url: imageUrl, version_count: nextVersion }
        : item
    )));
    setToast({ message: 'Variant image replaced', type: 'success' });
  }, [screenshots, setScreenshots, setToast, userId]);

  // Crop replaces the existing storage object — no version row is added
  // (saves space). Annotations are shifted/clipped relative to the new
  // dimensions; ones outside the kept area are deleted. Old storage object
  // is removed best-effort after the DB swap.
  const handleCropFamilyImage = useCallback(async (
    screenshotId: string,
    topTrim: number,
    bottomTrim: number,
    leftTrim: number,
    rightTrim: number,
  ): Promise<{ ok: boolean }> => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return { ok: false };
    if (topTrim === 0 && bottomTrim === 0 && leftTrim === 0 && rightTrim === 0) return { ok: false };

    if (!screenshot.image_url) return { ok: false };

    try {
      const cropResult = await cropImageBox({
        imageUrl: screenshot.image_url,
        topTrim,
        bottomTrim,
        leftTrim,
        rightTrim,
        fileName: screenshot.file_name || 'cropped.png',
      });

      const oldWidth = cropResult.originalWidth;
      const oldHeight = cropResult.originalHeight;
      const newWidth = cropResult.width;
      const newHeight = cropResult.height;

      const thumbHash = await generateThumbHash(cropResult.file);

      const safeName = `cropped-${Date.now()}-${(screenshot.file_name || 'screenshot').replace(/\s+/g, '-')}`;
      const newStoragePath = `${userId}/all-projects/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(newStoragePath, cropResult.file);

      if (uploadError) {
        setToast({ message: `Crop failed: ${uploadError.message}`, type: 'error' });
        return { ok: false };
      }

      const oldStoragePath = screenshot.storage_path;
      let dbError = (await supabase
        .from('screenshots')
        .update({ storage_path: newStoragePath, thumb_hash: thumbHash })
        .eq('id', screenshotId)).error;

      // Fall back without thumb_hash when PostgREST's schema cache hasn't
      // picked up the column yet (resolved by `NOTIFY pgrst, 'reload schema'`).
      if (dbError && /thumb_hash/i.test(dbError.message || '')) {
        dbError = (await supabase
          .from('screenshots')
          .update({ storage_path: newStoragePath })
          .eq('id', screenshotId)).error;
      }

      if (dbError) {
        // Roll back the just-uploaded file so we don't leave an orphan.
        await supabase.storage.from('screenshots').remove([newStoragePath]);
        setToast({ message: `Crop failed: ${dbError.message}`, type: 'error' });
        return { ok: false };
      }

      // Shift / clip annotations to the new image bounds. Coordinates are
      // stored as percentages of the image, so a re-percent over the new
      // width / height is required.
      const annotations = await fetchAnnotationsForScreenshot(screenshotId);
      for (const annotation of annotations) {
        const xPx = (annotation.x / 100) * oldWidth;
        const yPx = (annotation.y / 100) * oldHeight;
        const widthPx = annotation.width !== null
          ? (annotation.width / 100) * oldWidth
          : 0;
        const heightPx = annotation.height !== null
          ? (annotation.height / 100) * oldHeight
          : 0;
        const newXPx = xPx - leftTrim;
        const newYPx = yPx - topTrim;
        const isPin = annotation.shape === 'pin' || annotation.height === null;

        if (isPin) {
          if (newXPx < 0 || newXPx >= newWidth || newYPx < 0 || newYPx >= newHeight) {
            await deleteAnnotation(annotation.id);
          } else {
            await updateAnnotationGeometry(annotation.id, {
              x: (newXPx / newWidth) * 100,
              y: (newYPx / newHeight) * 100,
              width: null,
              height: null,
            });
          }
          continue;
        }

        // area
        const annotationRightPx = xPx + widthPx;
        const annotationBottomPx = yPx + heightPx;
        if (annotationBottomPx <= topTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (yPx >= oldHeight - bottomTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (annotationRightPx <= leftTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }
        if (xPx >= oldWidth - rightTrim) {
          await deleteAnnotation(annotation.id);
          continue;
        }

        const clippedLeftPx = Math.max(0, newXPx);
        const clippedRightPx = Math.min(newWidth, newXPx + widthPx);
        const clippedWidthPx = Math.max(0, clippedRightPx - clippedLeftPx);
        const clippedTopPx = Math.max(0, newYPx);
        const clippedBottomPx = Math.min(newHeight, newYPx + heightPx);
        const clippedHeightPx = Math.max(0, clippedBottomPx - clippedTopPx);

        await updateAnnotationGeometry(annotation.id, {
          x: (clippedLeftPx / newWidth) * 100,
          y: (clippedTopPx / newHeight) * 100,
          width: (clippedWidthPx / newWidth) * 100,
          height: (clippedHeightPx / newHeight) * 100,
        });
      }

      // Cache-bust the public URL so the new bytes load even if a CDN
      // briefly serves the old object before deletion propagates.
      const baseUrl = supabase.storage.from('screenshots').getPublicUrl(newStoragePath).data.publicUrl;
      const newImageUrl = `${baseUrl}?v=${Date.now()}`;

      setScreenshots((previous) => previous.map((item) => (
        item.id === screenshotId
          ? { ...item, storage_path: newStoragePath, thumb_hash: thumbHash, image_url: newImageUrl }
          : item
      )));

      // Best-effort cleanup of the old object. Failure here is non-fatal.
      if (oldStoragePath) {
        void supabase.storage.from('screenshots').remove([oldStoragePath]);
      }

      setToast({ message: 'Image cropped', type: 'success' });
      return { ok: true };
    } catch (error) {
      setToast({
        message: `Crop failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        type: 'error',
      });
      return { ok: false };
    }
  }, [screenshots, setScreenshots, setToast, userId]);

  const handleSetReference = useCallback(async (
    screenshotId: string,
    input: { file: File | null; label: string | null },
  ) => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return false;

    const normalizedLabel = input.label?.trim() || null;
    let nextStoragePath = screenshot.reference_storage_path;
    let nextUrl = screenshot.reference_url;

    if (input.file) {
      const compressed = await compressImage(input.file);
      const safeName = input.file.name.replace(/\s+/g, '-');
      nextStoragePath = `${userId}/all-projects/references/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(nextStoragePath, compressed, { upsert: true });

      if (uploadError) {
        setToast({ message: `Reference upload failed: ${uploadError.message}`, type: 'error' });
        return false;
      }

      nextUrl = supabase.storage.from('screenshots').getPublicUrl(nextStoragePath).data.publicUrl;
    }

    const patch: Pick<ScreenshotNode, 'reference_label' | 'reference_storage_path' | 'reference_url'> = {
      reference_label: normalizedLabel,
      reference_storage_path: nextStoragePath,
      reference_url: nextUrl,
    };

    const { error } = await supabase.from('screenshots').update(patch).eq('id', screenshotId);
    if (error) {
      setToast({ message: `Could not update reference details: ${error.message}`, type: 'error' });
      return false;
    }

    setScreenshots((previous) => previous.map((item) => (
      item.id === screenshotId ? { ...item, ...patch } : item
    )));

    if (input.file && screenshot.reference_storage_path && screenshot.reference_storage_path !== nextStoragePath) {
      const { error: cleanupError } = await supabase.storage
        .from('screenshots')
        .remove([screenshot.reference_storage_path]);
      if (cleanupError) {
        setToast({
          message: `Reference updated, but old file cleanup failed: ${cleanupError.message}`,
          type: 'info',
        });
        return true;
      }
    }

    setToast({ message: input.file ? 'Reference updated' : 'Reference label updated', type: 'success' });
    return true;
  }, [screenshots, setScreenshots, setToast, userId]);

  const handleRemoveReference = useCallback(async (screenshotId: string) => {
    const screenshot = screenshots.find((item) => item.id === screenshotId);
    if (!screenshot) return false;

    const patch: Pick<ScreenshotNode, 'reference_label' | 'reference_storage_path' | 'reference_url'> = {
      reference_label: null,
      reference_storage_path: null,
      reference_url: null,
    };

    const { error } = await supabase.from('screenshots').update(patch).eq('id', screenshotId);
    if (error) {
      setToast({ message: `Could not remove reference image: ${error.message}`, type: 'error' });
      return false;
    }

    let cleanupError: string | null = null;
    if (screenshot.reference_storage_path) {
      const { error: storageError } = await supabase.storage
        .from('screenshots')
        .remove([screenshot.reference_storage_path]);
      if (storageError) cleanupError = storageError.message;
    }

    setScreenshots((previous) => previous.map((item) => (
      item.id === screenshotId ? { ...item, ...patch } : item
    )));

    setToast({
      message: cleanupError
        ? `Reference removed, but cleanup failed: ${cleanupError}`
        : 'Reference image removed',
      type: cleanupError ? 'info' : 'success',
    });
    return true;
  }, [screenshots, setScreenshots, setToast]);

  return {
    handleCropFamilyImage,
    handleRemoveReference,
    handleReplaceImage,
    handleSetReference,
  };
}
