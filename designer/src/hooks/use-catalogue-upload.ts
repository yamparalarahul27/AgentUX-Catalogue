import { useEffect, useMemo, useRef, useState } from 'react';

import type { FolderDropContext } from '../components/UploadZone';
import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { CATALOGUE_FLOW_LABEL_KEY, getScreenshotFamilyId, getVariantKey } from '../lib/catalogue-families';
import { compressImage } from '../lib/catalogue-image';
import { buildConventionName, parseScreenshotName } from '../lib/naming';
import { insertScreenshotWithUploader } from '../lib/screenshot-write';
import { supabase } from '../lib/supabase';
import { generateThumbHash } from '../lib/thumbhash';
import type { MobileOs, Project, ScreenshotNode, WebPreset } from '../types';

interface ToastState {
  message: string;
  type: 'error' | 'success' | 'info';
}

interface QuickUploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  parsed: ReturnType<typeof parseScreenshotName>;
}

export type UploadProgressStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface UploadProgressItem {
  id: string;
  fileName: string;
  previewUrl: string;
  status: UploadProgressStatus;
  errorMessage?: string;
  // Retained so that "Retry failed" can re-submit the original file.
  // Internal — not surfaced to consumers' rendering.
  retryItem?: QuickUploadQueueItem;
}

interface UseCatalogueUploadArgs {
  allFamilies: CatalogueFamilyView[];
  fullScopeScreenshots?: ScreenshotNode[];
  projects: Project[];
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotNode[]>>;
  setToast: React.Dispatch<React.SetStateAction<ToastState | null>>;
  userEmail?: string | null;
  userId: string;
  webPresets: WebPreset[];
}

export function useCatalogueUpload({
  allFamilies,
  fullScopeScreenshots,
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
  const quickUploadQueueRef = useRef<QuickUploadQueueItem[]>([]);
  const [quickUploadGroup, setQuickUploadGroup] = useState('');
  // Marketing role hints at which catalogue group a screenshot should
  // ultimately live in. Persisted to screenshots.suggested_group; Admin
  // sees it in the lightbox when reviewing the Marketing Bucket.
  const [quickUploadSuggestedGroup, setQuickUploadSuggestedGroup] = useState('');
  const [quickUploadFlowLabel, setQuickUploadFlowLabel] = useState('');
  const [quickUploadPlatform, setQuickUploadPlatform] = useState<'web' | 'mobile' | null>('web');
  const [quickUploadTheme, setQuickUploadTheme] = useState<'light' | 'dark' | null>('dark');
  const [quickUploadWebPresetKey, setQuickUploadWebPresetKey] = useState<string | null>(null);
  const [quickUploadMobileOs, setQuickUploadMobileOs] = useState<MobileOs | null>(null);
  const hasSeededQuickUploadFromFiltersRef = useRef(false);
  // Upload progress state surfaces the slim ribbon. Items move queued →
  // uploading → uploaded | failed. Successes vanish from the visible
  // ribbon, failures remain for retry. Cleared on dismiss.
  const [uploadProgress, setUploadProgress] = useState<UploadProgressItem[]>([]);
  const uploadProgressRef = useRef<UploadProgressItem[]>([]);
  useEffect(() => { uploadProgressRef.current = uploadProgress; }, [uploadProgress]);
  function buildFlowMetadata(value: string) {
    const label = value.trim();
    if (!label) return {};
    return { [CATALOGUE_FLOW_LABEL_KEY]: label };
  }

  // Project_id is still required by the DB schema as NOT NULL, so writes
  // (handled elsewhere in this hook) keep defaulting to projects[0]. The
  // group suggestion list, however, spans every project the user has access
  // to — same data set the chip strip and catalogue grid already render
  // from — so quick-upload suggestions match what the user actually sees.
  const defaultProjectId = projects[0]?.id ?? null;

  const uploadProjectGroups = useMemo(() => {
    return [...new Set(allFamilies.map((family) => family.group).filter(Boolean))] as string[];
  }, [allFamilies]);

  const quickUploadProjectGroups = useMemo(() => {
    const source = fullScopeScreenshots && fullScopeScreenshots.length > 0
      ? fullScopeScreenshots.map((screenshot) => screenshot.group)
      : allFamilies.map((family) => family.group);
    return [...new Set(source.filter(Boolean) as string[])].sort((left, right) => left.localeCompare(right));
  }, [allFamilies, fullScopeScreenshots]);

  const quickUploadQueuePreview = useMemo(
    () => quickUploadQueue.map((item) => ({
      id: item.id,
      fileName: item.file.name,
      previewUrl: item.previewUrl,
      parsedName: item.parsed.name,
      parsedGroup: item.parsed.group,
      parsedSequence: item.parsed.sequence,
    })),
    [quickUploadQueue],
  );

  useEffect(() => {
    quickUploadQueueRef.current = quickUploadQueue;
  }, [quickUploadQueue]);

  useEffect(() => () => {
    quickUploadQueueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

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
      const preferredWebPresetKey =
        webPresets.find((preset) => preset.width === 1512)?.key
        ?? webPresets[0]?.key
        ?? null;
      setQuickUploadWebPresetKey(preferredWebPresetKey);
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

  // Field values (Flow / Group / Platform / Theme / WebPresetKey / MobileOs)
  // intentionally NOT cleared here — they stick within the same browser
  // session so a designer doing a long upload run doesn't re-pick the same
  // chips on every batch. A page reload resets them via the hook re-mounting.
  function resetQuickUploadState() {
    setShowQuickUpload(false);
    setQuickUploadProjectId(null);
    setQuickUploadQueue((previous) => {
      previous.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  // Run only once per page load (first time the user opens Quick Upload).
  // If the catalogue toolbar has filters set, prefill the matching modal
  // fields so the user doesn't re-pick what they already filtered to.
  function seedQuickUploadFromFiltersIfFirstOpen(filters: {
    filterFlow: string[];
    filterGroup: string[];
    filterPlatform: string | null;
    filterTheme: string | null;
    filterWebPreset: string | null;
    filterMobileOs: string | null;
  }) {
    if (hasSeededQuickUploadFromFiltersRef.current) return;
    hasSeededQuickUploadFromFiltersRef.current = true;

    if (filters.filterFlow.length === 1) setQuickUploadFlowLabel(filters.filterFlow[0]);
    if (filters.filterGroup.length === 1) setQuickUploadGroup(filters.filterGroup[0]);
    if (filters.filterPlatform === 'web' || filters.filterPlatform === 'mobile') {
      setQuickUploadPlatform(filters.filterPlatform);
    }
    if (filters.filterTheme === 'light' || filters.filterTheme === 'dark') {
      setQuickUploadTheme(filters.filterTheme);
    }
    if (filters.filterWebPreset) setQuickUploadWebPresetKey(filters.filterWebPreset);
    if (filters.filterMobileOs === 'ios' || filters.filterMobileOs === 'android') {
      setQuickUploadMobileOs(filters.filterMobileOs);
    }
  }

  function handleQuickUploadProjectChange(projectId: string | null) {
    setQuickUploadProjectId(projectId);
  }

  function handleQuickUploadQueueAdd(files: File[], context?: FolderDropContext) {
    if (context?.multipleFolders) {
      setToast({ message: 'Drop one folder at a time', type: 'info' });
      return;
    }

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
          previewUrl: URL.createObjectURL(file),
          parsed: parseScreenshotName(file.name),
        });
      }

      return additions.length ? [...previous, ...additions] : previous;
    });

    // Auto-fill flow from folder name only when the user hasn't typed one.
    // Typed value is the source of truth.
    if (context?.folderName && quickUploadFlowLabel.trim().length === 0) {
      setQuickUploadFlowLabel(context.folderName);
    }

    if (context && context.skippedNonImageCount > 0) {
      const n = context.skippedNonImageCount;
      setToast({
        message: `Skipped ${n} non-image file${n === 1 ? '' : 's'}`,
        type: 'info',
      });
    }
  }

  function handleQuickUploadQueueRemove(id: string) {
    setQuickUploadQueue((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  }

  function handleQuickUploadQueueClear() {
    setQuickUploadQueue((previous) => {
      previous.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
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
        const thumbHash = await generateThumbHash(compressed).catch(() => null);
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
            thumb_hash: thumbHash,
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

  async function uploadOneQuickItem(
    item: QuickUploadQueueItem,
    batch: {
      projectId: string;
      group: string;
      suggestedGroup: string;
      flowLabel: string;
      platform: 'web' | 'mobile' | null;
      theme: 'light' | 'dark' | null;
      webPresetKey: string | null;
      mobileOs: MobileOs | null;
    },
  ): Promise<ScreenshotNode> {
    const { file, parsed } = item;
    const group = batch.group || parsed.group;
    const flowLabel = batch.flowLabel || parsed.group || null;
    const flowMetadata = flowLabel ? { [CATALOGUE_FLOW_LABEL_KEY]: flowLabel } : {};
    const compressed = await compressImage(file);
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const storagePath = `${userId}/${batch.projectId}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from('screenshots').upload(storagePath, compressed, { upsert: true });
    if (uploadError) throw uploadError;

    const imageUrl = supabase.storage.from('screenshots').getPublicUrl(storagePath).data.publicUrl;
    const { data, error } = await insertScreenshotWithUploader({
      supabase,
      payload: {
        project_id: batch.projectId,
        flow_id: null,
        screen_family_id: null,
        name: buildConventionName(parsed.sequence, flowLabel || parsed.group, parsed.name),
        file_name: file.name,
        storage_path: storagePath,
        sequence: parsed.sequence,
        group,
        theme: batch.theme,
        platform: batch.platform,
        web_preset_key: batch.webPresetKey,
        mobile_os: batch.mobileOs,
        metadata: flowMetadata,
        reference_url: null,
        reference_storage_path: null,
        reference_label: null,
        suggested_group: batch.suggestedGroup || null,
      },
      uploader: { userEmail, userId },
    });
    if (error || !data) throw error ?? new Error('Insert returned no data');

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
  }

  async function handleQuickUploadUploadAll(retryQueue?: QuickUploadQueueItem[]) {
    const projectId = quickUploadProjectId ?? defaultProjectId;
    const sourceQueue = retryQueue ?? quickUploadQueue;
    if (sourceQueue.length === 0) {
      return [] as ScreenshotNode[];
    }
    if (!projectId) {
      setToast({ message: 'Create a project before uploading screenshots', type: 'error' });
      return [] as ScreenshotNode[];
    }

    const queue = [...sourceQueue];
    const batchGroup = quickUploadGroup.trim();
    const batchFlowLabel = quickUploadFlowLabel.trim();

    if (!batchFlowLabel) {
      setToast({ message: 'Add a flow name before uploading', type: 'error' });
      return [] as ScreenshotNode[];
    }

    const batch = {
      projectId,
      group: batchGroup,
      suggestedGroup: quickUploadSuggestedGroup.trim(),
      flowLabel: batchFlowLabel,
      platform: quickUploadPlatform,
      theme: quickUploadTheme,
      webPresetKey: quickUploadPlatform === 'web' ? quickUploadWebPresetKey : null,
      mobileOs: quickUploadPlatform === 'mobile' ? quickUploadMobileOs : null,
    };

    setUploading(true);

    // Seed the progress ribbon: append items in 'queued' state. For a
    // retry, the items are already in the ribbon as 'failed' — flip
    // them back to 'queued'. For a fresh batch, start from blank.
    if (retryQueue) {
      const retryIds = new Set(retryQueue.map((item) => item.id));
      setUploadProgress((previous) =>
        previous.map((entry) =>
          retryIds.has(entry.id)
            ? { ...entry, status: 'queued', errorMessage: undefined }
            : entry,
        ),
      );
    } else {
      // Fresh ObjectURLs for the progress ribbon — the queue's URLs are
      // about to be revoked by resetQuickUploadState() below, so we own
      // an independent set here. Revoked when progress is dismissed.
      const seeded: UploadProgressItem[] = queue.map((item) => ({
        id: item.id,
        fileName: item.file.name,
        previewUrl: URL.createObjectURL(item.file),
        status: 'queued',
        retryItem: item,
      }));
      setUploadProgress(seeded);
    }

    if (!retryQueue) resetQuickUploadState();

    const tasks = queue.map((item) => {
      setUploadProgress((previous) =>
        previous.map((entry) => (entry.id === item.id ? { ...entry, status: 'uploading' } : entry)),
      );
      return uploadOneQuickItem(item, batch).then(
        (result) => {
          setUploadProgress((previous) =>
            previous.map((entry) => (entry.id === item.id ? { ...entry, status: 'uploaded' } : entry)),
          );
          return result;
        },
        (err) => {
          const message = err instanceof Error ? err.message : String(err ?? 'Upload failed');
          setUploadProgress((previous) =>
            previous.map((entry) =>
              entry.id === item.id ? { ...entry, status: 'failed', errorMessage: message } : entry,
            ),
          );
          throw err;
        },
      );
    });

    const results = await Promise.allSettled(tasks);
    const inserted = results
      .filter((result): result is PromiseFulfilledResult<ScreenshotNode> => result.status === 'fulfilled')
      .map((result) => result.value);

    if (inserted.length > 0) {
      setScreenshots((previous) => [...inserted, ...previous]);
      inserted.forEach((item) => {
        updateActiveVariant(getScreenshotFamilyId(item), getVariantKey(item));
      });
    }

    setUploading(false);
    return inserted;
  }

  function dismissUploadProgress() {
    uploadProgressRef.current.forEach((entry) => {
      URL.revokeObjectURL(entry.previewUrl);
    });
    setUploadProgress([]);
  }

  async function retryFailedUploads() {
    const failedIds = uploadProgressRef.current
      .filter((entry) => entry.status === 'failed')
      .map((entry) => entry.id);
    if (failedIds.length === 0) return;
    // Failed items are no longer in the queue (queue clears on first
    // upload start). Reconstruct from progress entries' previewUrl
    // isn't enough — we need the underlying File. Cache files in the
    // progress entries themselves.
    const items = uploadProgressRef.current
      .filter((entry) => entry.status === 'failed' && entry.retryItem)
      .map((entry) => entry.retryItem as QuickUploadQueueItem);
    if (items.length === 0) return;
    await handleQuickUploadUploadAll(items);
  }

  return {
    activeVariantKeys,
    handleQuickUploadProjectChange,
    handleQuickUploadQueueAdd,
    handleQuickUploadQueueClear,
    handleQuickUploadQueueRemove,
    handleQuickUploadUploadAll,
    uploadProgress,
    dismissUploadProgress,
    retryFailedUploads,
    resetUploadState,
    resetQuickUploadState,
    seedQuickUploadFromFiltersIfFirstOpen,
    quickUploadFlowLabel,
    quickUploadGroup,
    quickUploadSuggestedGroup,
    quickUploadMobileOs,
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
    setQuickUploadFlowLabel,
    setQuickUploadGroup,
    setQuickUploadSuggestedGroup,
    setQuickUploadMobileOs,
    setQuickUploadPlatform,
    setQuickUploadTheme,
    setQuickUploadWebPresetKey,
  };
}
