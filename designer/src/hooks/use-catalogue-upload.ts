import { useEffect, useMemo, useRef, useState } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getScreenshotFamilyId, getVariantKey, getVariantLabel } from '../lib/catalogue-families';
import { compressImage } from '../lib/catalogue-image';
import { parseScreenshotName } from '../lib/naming';
import { insertScreenshotWithUploader } from '../lib/screenshot-write';
import { supabase } from '../lib/supabase';
import type { MobileOs, ScreenFamily, ScreenshotNode, WebPreset } from '../types';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

type DuplicateResolutionAction = 'replace' | 'add-version' | 'cancel';

interface DuplicateResolutionState {
  familyName: string;
  fileName: string;
  variantLabel: string;
}

interface UseCatalogueUploadArgs {
  allFamilies: CatalogueFamilyView[];
  handleReplaceImage: (id: string, file: File) => Promise<void>;
  presetByKey: Record<string, WebPreset>;
  screenFamilies: ScreenFamily[];
  screenshots: ScreenshotNode[];
  setScreenFamilies: React.Dispatch<React.SetStateAction<ScreenFamily[]>>;
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userEmail?: string | null;
  userId: string;
  webPresets: WebPreset[];
}

export function useCatalogueUpload({
  allFamilies,
  handleReplaceImage,
  presetByKey,
  screenFamilies,
  screenshots,
  setScreenFamilies,
  setScreenshots,
  setToast,
  userEmail,
  userId,
  webPresets,
}: UseCatalogueUploadArgs) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null);
  const [uploadFamilyId, setUploadFamilyId] = useState<string | null>(null);
  const [uploadNewFamilyMode, setUploadNewFamilyMode] = useState(false);
  const [uploadNewFamilyName, setUploadNewFamilyName] = useState('');
  const [uploadNewFamilyGroup, setUploadNewFamilyGroup] = useState('');
  const [uploadTheme, setUploadTheme] = useState<'light' | 'dark' | null>(null);
  const [uploadPlatform, setUploadPlatform] = useState<'mobile' | 'web' | null>(null);
  const [uploadWebPresetKey, setUploadWebPresetKey] = useState<string | null>(null);
  const [uploadMobileOs, setUploadMobileOs] = useState<MobileOs | null>(null);
  const [uploadRefFile, setUploadRefFile] = useState<File | null>(null);
  const [uploadRefLabel, setUploadRefLabel] = useState('');
  const [uploadRefPreview, setUploadRefPreview] = useState<string | null>(null);
  const [activeVariantKeys, setActiveVariantKeys] = useState<Record<string, string>>({});
  const [duplicateState, setDuplicateState] = useState<DuplicateResolutionState | null>(null);
  const duplicateResolverRef = useRef<((action: DuplicateResolutionAction) => void) | null>(null);

  const uploadProjectFamilies = useMemo(
    () => screenFamilies
      .filter((family) => family.project_id === uploadProjectId)
      .sort((left, right) => left.name.localeCompare(right.name)),
    [screenFamilies, uploadProjectId],
  );

  const uploadProjectGroups = useMemo(() => {
    const families = allFamilies.filter((family) => family.project_id === uploadProjectId);
    return [...new Set(families.map((family) => family.group).filter(Boolean))] as string[];
  }, [allFamilies, uploadProjectId]);

  useEffect(() => {
    if (uploadPlatform === 'web' && !uploadWebPresetKey) {
      setUploadWebPresetKey(webPresets[0]?.key ?? null);
      setUploadMobileOs(null);
    }
    if (uploadPlatform === 'mobile' && !uploadMobileOs) {
      setUploadMobileOs('ios');
      setUploadWebPresetKey(null);
    }
    if (!uploadPlatform) {
      setUploadWebPresetKey(null);
      setUploadMobileOs(null);
    }
  }, [uploadMobileOs, uploadPlatform, uploadWebPresetKey, webPresets]);

  function updateActiveVariant(familyId: string, variantKey: string) {
    setActiveVariantKeys((previous) => ({ ...previous, [familyId]: variantKey }));
  }

  function resetUploadState() {
    setShowUpload(false);
    setUploadProjectId(null);
    setUploadFamilyId(null);
    setUploadNewFamilyMode(false);
    setUploadNewFamilyName('');
    setUploadNewFamilyGroup('');
    setUploadTheme(null);
    setUploadPlatform(null);
    setUploadWebPresetKey(null);
    setUploadMobileOs(null);
    setUploadRefFile(null);
    setUploadRefLabel('');
    if (uploadRefPreview) {
      URL.revokeObjectURL(uploadRefPreview);
      setUploadRefPreview(null);
    }
  }

  function requestDuplicateResolution(details: DuplicateResolutionState) {
    return new Promise<DuplicateResolutionAction>((resolve) => {
      duplicateResolverRef.current = resolve;
      setDuplicateState(details);
    });
  }

  function resolveDuplicateResolution(action: DuplicateResolutionAction) {
    duplicateResolverRef.current?.(action);
    duplicateResolverRef.current = null;
    setDuplicateState(null);
  }

  async function createFamily(projectId: string, name: string, group: string): Promise<ScreenFamily | null> {
    const { data, error } = await supabase
      .from('screen_families')
      .insert({ project_id: projectId, name, group, flow_id: null })
      .select()
      .single();

    if (error || !data) {
      setToast({ message: 'Could not create the screen family', type: 'error' });
      return null;
    }

    setScreenFamilies((previous) => [data, ...previous]);
    return data as ScreenFamily;
  }

  async function addVersionOnly(id: string, file: File) {
    const screenshot = screenshots.find((item) => item.id === id);
    if (!screenshot) return;
    const { count } = await supabase
      .from('screenshot_versions')
      .select('*', { count: 'exact', head: true })
      .eq('screenshot_id', id);
    const nextVersion = (count ?? 0) + 1;
    const compressed = await compressImage(file);
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const storagePath = `${userId}/${screenshot.project_id}/versions/${safeName}`;
    const { error } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

    if (error) {
      setToast({ message: `Version upload failed: ${error.message}`, type: 'error' });
      return;
    }

    await supabase.from('screenshot_versions').insert({
      screenshot_id: id,
      version_number: nextVersion,
      storage_path: storagePath,
      file_name: file.name,
    });

    setScreenshots((previous) => previous.map((item) => (
      item.id === id ? { ...item, version_count: nextVersion } : item
    )));
  }

  async function uploadReference(projectId: string) {
    if (!uploadRefFile) {
      return { referenceLabel: uploadRefLabel.trim() || null, referenceStoragePath: null, referenceUrl: null };
    }

    const compressed = await compressImage(uploadRefFile);
    const safeName = uploadRefFile.name.replace(/\s+/g, '-');
    const storagePath = `${userId}/${projectId}/references/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

    if (error) {
      setToast({ message: `Reference upload failed: ${error.message}`, type: 'error' });
      return { referenceLabel: uploadRefLabel.trim() || null, referenceStoragePath: null, referenceUrl: null };
    }

    return {
      referenceLabel: uploadRefLabel.trim() || null,
      referenceStoragePath: storagePath,
      referenceUrl: supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl,
    };
  }

  async function handleFilesSelected(files: File[]) {
    if (!uploadProjectId || !uploadPlatform || !uploadTheme) return;

    setUploading(true);

    const family = uploadNewFamilyMode
      ? await createFamily(uploadProjectId, uploadNewFamilyName.trim(), uploadNewFamilyGroup.trim())
      : uploadProjectFamilies.find((item) => item.id === uploadFamilyId) ?? null;

    if (!family) {
      setUploading(false);
      return;
    }

    const reference = await uploadReference(uploadProjectId);
    const inserted: ScreenshotNode[] = [];
    let replacedCount = 0;
    let versionedCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const availableScreenshots = [...screenshots, ...inserted];
      const duplicate = availableScreenshots.find((screenshot) => {
        if (screenshot.screen_family_id !== family.id) return false;
        if (screenshot.theme !== uploadTheme) return false;
        if (screenshot.platform !== uploadPlatform) return false;
        if (uploadPlatform === 'web') return screenshot.web_preset_key === uploadWebPresetKey;
        if (uploadPlatform === 'mobile') return screenshot.mobile_os === uploadMobileOs;
        return false;
      });

      if (duplicate) {
        const variantLabel = getVariantLabel({
          ...duplicate,
          theme: uploadTheme,
          platform: uploadPlatform,
          web_preset_key: uploadWebPresetKey,
          mobile_os: uploadMobileOs,
        }, presetByKey);
        const resolution = await requestDuplicateResolution({
          familyName: family.name,
          fileName: file.name,
          variantLabel,
        });

        if (resolution === 'cancel') {
          failedCount += 1;
          continue;
        }
        if (resolution === 'replace') {
          await handleReplaceImage(duplicate.id, file);
          replacedCount += 1;
          continue;
        }
        await addVersionOnly(duplicate.id, file);
        versionedCount += 1;
        continue;
      }

      try {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const storagePath = `${userId}/${uploadProjectId}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
        const { data, error } = await insertScreenshotWithUploader({
          supabase,
          payload: {
            project_id: uploadProjectId,
            flow_id: family.flow_id,
            screen_family_id: family.id,
            name: family.name,
            file_name: file.name,
            storage_path: storagePath,
            sequence: parsed.sequence,
            group: family.group,
            theme: uploadTheme,
            platform: uploadPlatform,
            web_preset_key: uploadPlatform === 'web' ? uploadWebPresetKey : null,
            mobile_os: uploadPlatform === 'mobile' ? uploadMobileOs : null,
            reference_url: reference.referenceUrl,
            reference_storage_path: reference.referenceStoragePath,
            reference_label: reference.referenceLabel,
          },
          uploader: { userEmail, userId },
        });

        if (error || !data) {
          throw error;
        }

        inserted.push({
          ...data,
          image_url: imageUrl,
          metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {},
          version_count: 0,
          comment_count: 0,
          comment_last_added_at: null,
          annotation_count: 0,
          annotation_last_added_at: null,
        } as ScreenshotNode);
      } catch {
        failedCount += 1;
      }
    }

    if (inserted.length > 0) {
      setScreenshots((previous) => [...inserted, ...previous]);
      inserted.forEach((item) => {
        updateActiveVariant(getScreenshotFamilyId(item), getVariantKey(item));
      });
    }

    const successCount = inserted.length + replacedCount + versionedCount;
    if (successCount > 0) {
      const messages = [`${successCount} file${successCount > 1 ? 's' : ''} handled`];
      if (replacedCount > 0) messages.push(`${replacedCount} replaced`);
      if (versionedCount > 0) messages.push(`${versionedCount} versioned`);
      if (failedCount > 0) messages.push(`${failedCount} skipped`);
      setToast({ message: messages.join(' • '), type: failedCount > 0 ? 'info' : 'success' });
    } else if (failedCount > 0) {
      setToast({ message: `Upload failed for ${failedCount} file${failedCount > 1 ? 's' : ''}`, type: 'error' });
    }

    if (uploadNewFamilyMode && inserted.length === 0) {
      await supabase.from('screen_families').delete().eq('id', family.id);
      setScreenFamilies((previous) => previous.filter((item) => item.id !== family.id));

      if (reference.referenceStoragePath) {
        await supabase.storage.from('screenshots').remove([reference.referenceStoragePath]);
      }
    }

    setUploading(false);
    resetUploadState();
  }

  return {
    activeVariantKeys,
    duplicateState,
    resolveDuplicateResolution,
    resetUploadState,
    setShowUpload,
    showUpload,
    updateActiveVariant,
    uploadFamilyId,
    uploadMobileOs,
    uploadNewFamilyGroup,
    uploadNewFamilyMode,
    uploadNewFamilyName,
    uploadPlatform,
    uploadProjectFamilies,
    uploadProjectGroups,
    uploadProjectId,
    uploadRefFile,
    uploadRefLabel,
    uploadRefPreview,
    uploadTheme,
    uploadWebPresetKey,
    uploading,
    handleFilesSelected,
    setUploadFamilyId,
    setUploadMobileOs,
    setUploadNewFamilyGroup,
    setUploadNewFamilyMode,
    setUploadNewFamilyName,
    setUploadPlatform,
    setUploadProjectId,
    setUploadRefFile,
    setUploadRefLabel,
    setUploadRefPreview,
    setUploadTheme,
    setUploadWebPresetKey,
  };
}
