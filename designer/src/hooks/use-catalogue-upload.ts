import { useEffect, useMemo, useState } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CATALOGUE_FLOW_LABEL_KEY, getScreenshotFamilyId, getVariantKey } from '../lib/catalogue-families';
import { compressImage } from '../lib/catalogue-image';
import { buildConventionName, isConventionName, parseScreenshotName } from '../lib/naming';
import { insertScreenshotWithUploader } from '../lib/screenshot-write';
import { supabase } from '../lib/supabase';
import type { MobileOs, Project, ScreenshotNode, WebPreset } from '../types';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

type QuickUploadGroupMode = 'auto' | 'existing' | 'new';

interface QuickUploadQueueItem {
  id: string;
  file: File;
  parsed: ReturnType<typeof parseScreenshotName>;
}

interface UseCatalogueUploadArgs {
  allFamilies: CatalogueFamilyView[];
  projects: Project[];
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userEmail?: string | null;
  userId: string;
  webPresets: WebPreset[];
}

export function useCatalogueUpload({
  allFamilies,
  projects,
  setScreenshots,
  setToast,
  userEmail,
  userId,
  webPresets,
}: UseCatalogueUploadArgs) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null);
  const [uploadNewFamilyName, setUploadNewFamilyName] = useState('');
  const [uploadNewFamilyGroup, setUploadNewFamilyGroup] = useState('');
  const [uploadFlowLabel, setUploadFlowLabel] = useState('');
  const [uploadTheme, setUploadTheme] = useState<'light' | 'dark' | null>(null);
  const [uploadPlatform, setUploadPlatform] = useState<'mobile' | 'web' | null>(null);
  const [uploadWebPresetKey, setUploadWebPresetKey] = useState<string | null>(null);
  const [uploadMobileOs, setUploadMobileOs] = useState<MobileOs | null>(null);
  const [uploadRefFile, setUploadRefFile] = useState<File | null>(null);
  const [uploadRefLabel, setUploadRefLabel] = useState('');
  const [uploadRefPreview, setUploadRefPreview] = useState<string | null>(null);
  const [activeVariantKeys, setActiveVariantKeys] = useState<Record<string, string>>({});
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const [quickUploadProjectId, setQuickUploadProjectId] = useState<string | null>(null);
  const [quickUploadQueue, setQuickUploadQueue] = useState<QuickUploadQueueItem[]>([]);
  const [quickUploadGroupMode, setQuickUploadGroupMode] = useState<QuickUploadGroupMode>('auto');
  const [quickUploadExistingGroup, setQuickUploadExistingGroup] = useState<string | null>(null);
  const [quickUploadNewGroup, setQuickUploadNewGroup] = useState('');
  const [quickUploadFlowLabel, setQuickUploadFlowLabel] = useState('');
  const [quickUploadPlatform, setQuickUploadPlatform] = useState<'web' | 'mobile' | null>(null);
  const [quickUploadTheme, setQuickUploadTheme] = useState<'light' | 'dark' | null>(null);
  const [quickUploadWebPresetKey, setQuickUploadWebPresetKey] = useState<string | null>(null);
  const [quickUploadMobileOs, setQuickUploadMobileOs] = useState<MobileOs | null>(null);
  function buildFlowMetadata(value: string) {
    const label = value.trim();
    if (!label) return {};
    return { [CATALOGUE_FLOW_LABEL_KEY]: label };
  }

  const defaultProjectId = projects[0]?.id ?? null;
  const effectiveUploadProjectId = uploadProjectId ?? defaultProjectId;
  const effectiveQuickUploadProjectId = quickUploadProjectId ?? defaultProjectId;

  const uploadProjectGroups = useMemo(() => {
    const families = allFamilies.filter((family) => family.project_id === effectiveUploadProjectId);
    return [...new Set(families.map((family) => family.group).filter(Boolean))] as string[];
  }, [allFamilies, effectiveUploadProjectId]);

  const quickUploadProjectGroups = useMemo(() => {
    const families = allFamilies.filter((family) => family.project_id === effectiveQuickUploadProjectId);
    return [...new Set(families.map((family) => family.group).filter(Boolean))] as string[];
  }, [allFamilies, effectiveQuickUploadProjectId]);

  const quickUploadQueuePreview = useMemo(
    () => quickUploadQueue.map((item) => ({
      id: item.id,
      fileName: item.file.name,
      parsedName: item.parsed.name,
      parsedGroup: item.parsed.group,
      parsedSequence: item.parsed.sequence,
    })),
    [quickUploadQueue],
  );

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

  useEffect(() => {
    if (quickUploadPlatform === 'web' && !quickUploadWebPresetKey) {
      setQuickUploadWebPresetKey(webPresets[0]?.key ?? null);
      setQuickUploadMobileOs(null);
    }
    if (quickUploadPlatform === 'mobile' && !quickUploadMobileOs) {
      setQuickUploadMobileOs('ios');
      setQuickUploadWebPresetKey(null);
    }
    if (!quickUploadPlatform) {
      setQuickUploadWebPresetKey(null);
      setQuickUploadMobileOs(null);
    }
  }, [quickUploadMobileOs, quickUploadPlatform, quickUploadWebPresetKey, webPresets]);

  useEffect(() => {
    if (!showUpload || uploadProjectId || !defaultProjectId) return;
    setUploadProjectId(defaultProjectId);
  }, [defaultProjectId, showUpload, uploadProjectId]);

  useEffect(() => {
    if (!showQuickUpload || quickUploadProjectId || !defaultProjectId) return;
    setQuickUploadProjectId(defaultProjectId);
  }, [defaultProjectId, quickUploadProjectId, showQuickUpload]);

  function updateActiveVariant(familyId: string, variantKey: string) {
    setActiveVariantKeys((previous) => ({ ...previous, [familyId]: variantKey }));
  }

  function resetUploadState() {
    setShowUpload(false);
    setUploadProjectId(null);
    setUploadNewFamilyName('');
    setUploadNewFamilyGroup('');
    setUploadFlowLabel('');
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

  function resetQuickUploadState() {
    setShowQuickUpload(false);
    setQuickUploadProjectId(null);
    setQuickUploadQueue([]);
    setQuickUploadGroupMode('auto');
    setQuickUploadExistingGroup(null);
    setQuickUploadNewGroup('');
    setQuickUploadFlowLabel('');
    setQuickUploadPlatform(null);
    setQuickUploadTheme(null);
    setQuickUploadWebPresetKey(null);
    setQuickUploadMobileOs(null);
  }

  function handleQuickUploadProjectChange(projectId: string | null) {
    setQuickUploadProjectId(projectId);
    setQuickUploadExistingGroup(null);
  }

  function handleQuickUploadGroupModeChange(mode: QuickUploadGroupMode) {
    setQuickUploadGroupMode(mode);
    if (mode === 'existing') {
      setQuickUploadExistingGroup((previous) => previous || quickUploadProjectGroups[0] || null);
    }
  }

  function handleQuickUploadQueueAdd(files: File[]) {
    setQuickUploadQueue((previous) => {
      const seen = new Set(previous.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const additions: QuickUploadQueueItem[] = [];

      for (const file of files) {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        additions.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
          file,
          parsed: parseScreenshotName(file.name),
        });
      }

      return additions.length ? [...previous, ...additions] : previous;
    });
  }

  function handleQuickUploadQueueRemove(id: string) {
    setQuickUploadQueue((previous) => previous.filter((item) => item.id !== id));
  }

  function handleQuickUploadQueueClear() {
    setQuickUploadQueue([]);
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
    const projectId = uploadProjectId ?? defaultProjectId;
    if (!projectId) {
      setToast({ message: 'Create a project before uploading screenshots', type: 'error' });
      return;
    }
    if (!uploadPlatform || !uploadTheme) return;
    const screenshotName = uploadNewFamilyName.trim();
    const screenshotGroup = uploadNewFamilyGroup.trim();
    if (!screenshotName || !screenshotGroup) {
      setToast({ message: 'Enter screenshot name and group before uploading', type: 'error' });
      return;
    }
    const flowMetadata = buildFlowMetadata(uploadFlowLabel);

    setUploading(true);

    const reference = await uploadReference(projectId);
    const inserted: ScreenshotNode[] = [];
    let failedCount = 0;

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const parsed = parseScreenshotName(file.name);
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const storagePath = `${userId}/${projectId}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
        const { data, error } = await insertScreenshotWithUploader({
          supabase,
          payload: {
            project_id: projectId,
            flow_id: null,
            screen_family_id: null,
            name: screenshotName,
            file_name: file.name,
            storage_path: storagePath,
            sequence: parsed.sequence,
            group: screenshotGroup,
            theme: uploadTheme,
            platform: uploadPlatform,
            web_preset_key: uploadPlatform === 'web' ? uploadWebPresetKey : null,
            mobile_os: uploadPlatform === 'mobile' ? uploadMobileOs : null,
            metadata: flowMetadata,
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

    const successCount = inserted.length;
    if (successCount > 0) {
      const messages = [`${successCount} file${successCount > 1 ? 's' : ''} uploaded`];
      if (failedCount > 0) messages.push(`${failedCount} skipped`);
      setToast({ message: messages.join(' • '), type: failedCount > 0 ? 'info' : 'success' });
    } else if (failedCount > 0) {
      setToast({ message: `Upload failed for ${failedCount} file${failedCount > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
    resetUploadState();
  }

  async function handleQuickUploadUploadAll() {
    const projectId = quickUploadProjectId ?? defaultProjectId;
    if (quickUploadQueue.length === 0) {
      return [] as ScreenshotNode[];
    }
    if (!projectId) {
      setToast({ message: 'Create a project before uploading screenshots', type: 'error' });
      return [] as ScreenshotNode[];
    }

    const queue = [...quickUploadQueue];
    const mode = quickUploadGroupMode;
    const existingGroup = quickUploadExistingGroup?.trim() || null;
    const newGroup = quickUploadNewGroup.trim();
    const batchFlowLabel = quickUploadFlowLabel.trim();
    const batchPlatform = quickUploadPlatform;
    const batchTheme = quickUploadTheme;
    const batchWebPresetKey = quickUploadPlatform === 'web' ? quickUploadWebPresetKey : null;
    const batchMobileOs = quickUploadPlatform === 'mobile' ? quickUploadMobileOs : null;

    if (mode === 'existing' && !existingGroup) {
      setToast({ message: 'Select an existing group before uploading', type: 'error' });
      return [] as ScreenshotNode[];
    }

    if (mode === 'new' && !newGroup) {
      setToast({ message: 'Enter a group name before uploading', type: 'error' });
      return [] as ScreenshotNode[];
    }

    setUploading(true);
    resetQuickUploadState();

    const results = await Promise.allSettled(
      queue.map(async (item) => {
        const { file, parsed } = item;
        const group = mode === 'existing' ? existingGroup : mode === 'new' ? newGroup : parsed.group;
        const flowLabel = batchFlowLabel || parsed.group || null;
        const flowMetadata = flowLabel ? { [CATALOGUE_FLOW_LABEL_KEY]: flowLabel } : {};
        const compressed = await compressImage(file);
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const storagePath = `${userId}/${projectId}/${safeName}`;
        const { error: uploadError } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
        const { data, error } = await insertScreenshotWithUploader({
          supabase,
          payload: {
            project_id: projectId,
            flow_id: null,
            screen_family_id: null,
            name: buildConventionName(parsed.sequence, flowLabel || parsed.group, parsed.name),
            file_name: file.name,
            storage_path: storagePath,
            sequence: parsed.sequence,
            group,
            theme: batchTheme,
            platform: batchPlatform,
            web_preset_key: batchWebPresetKey,
            mobile_os: batchMobileOs,
            metadata: flowMetadata,
            reference_url: null,
            reference_storage_path: null,
            reference_label: null,
          },
          uploader: { userEmail, userId },
        });

        if (error || !data) {
          throw error;
        }

        return {
          ...data,
          image_url: imageUrl,
          metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {},
          version_count: 0,
          comment_count: 0,
          comment_last_added_at: null,
          annotation_count: 0,
          annotation_last_added_at: null,
        } as ScreenshotNode;
      }),
    );

    const inserted = results
      .filter((result): result is PromiseFulfilledResult<ScreenshotNode> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failed = results.filter((result) => result.status === 'rejected').length;

    if (inserted.length > 0) {
      setScreenshots((previous) => [...inserted, ...previous]);
      inserted.forEach((item) => {
        updateActiveVariant(getScreenshotFamilyId(item), getVariantKey(item));
      });
      const nonConventionCount = inserted.filter((item) => !isConventionName(item.name)).length;
      const messages = [`${inserted.length} uploaded`];
      if (failed) messages.push(`${failed} failed`);
      if (nonConventionCount) messages.push(`${nonConventionCount} need renaming to convention format`);
      setToast({
        message: messages.join(' · '),
        type: failed || nonConventionCount ? 'info' : 'success',
      });
    } else if (failed > 0) {
      setToast({ message: `Upload failed for ${failed} file${failed > 1 ? 's' : ''}`, type: 'error' });
    }

    setUploading(false);
    return inserted;
  }

  return {
    activeVariantKeys,
    handleQuickUploadGroupModeChange,
    handleQuickUploadProjectChange,
    handleQuickUploadQueueAdd,
    handleQuickUploadQueueClear,
    handleQuickUploadQueueRemove,
    handleQuickUploadUploadAll,
    resetUploadState,
    resetQuickUploadState,
    quickUploadExistingGroup,
    quickUploadFlowLabel,
    quickUploadGroupMode,
    quickUploadMobileOs,
    quickUploadNewGroup,
    quickUploadPlatform,
    quickUploadProjectGroups,
    quickUploadProjectId,
    quickUploadQueuePreview,
    quickUploadTheme,
    quickUploadWebPresetKey,
    setShowUpload,
    setShowQuickUpload,
    showUpload,
    showQuickUpload,
    updateActiveVariant,
    uploadFlowLabel,
    uploadMobileOs,
    uploadNewFamilyGroup,
    uploadNewFamilyName,
    uploadPlatform,
    uploadProjectGroups,
    uploadProjectId,
    uploadRefFile,
    uploadRefLabel,
    uploadRefPreview,
    uploadTheme,
    uploadWebPresetKey,
    uploading,
    handleFilesSelected,
    setUploadFlowLabel,
    setUploadMobileOs,
    setUploadNewFamilyGroup,
    setUploadNewFamilyName,
    setUploadPlatform,
    setUploadProjectId,
    setUploadRefFile,
    setUploadRefLabel,
    setUploadRefPreview,
    setUploadTheme,
    setUploadWebPresetKey,
    setQuickUploadExistingGroup,
    setQuickUploadFlowLabel,
    setQuickUploadMobileOs,
    setQuickUploadNewGroup,
    setQuickUploadPlatform,
    setQuickUploadTheme,
    setQuickUploadWebPresetKey,
  };
}
