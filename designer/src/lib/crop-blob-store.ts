import { createStore, del, get, keys, set, values } from 'idb-keyval';

// Separate IndexedDB store dedicated to queued crop blobs. Kept apart
// from the text-mutation queue (lib/mutation-queue.ts) so:
//   - Large binary blobs don't share a key namespace with serialised
//     mutation records.
//   - Iterating blob keys for quota / cleanup never touches text mutations.
//   - The custom store name makes the IDB devtools view easier to read.
//
// Each entry: key → Blob (idb-keyval handles native Blob serialisation
// across all modern browsers including iOS Safari).
const cropBlobStore = createStore('agentux-crop-blobs', 'blobs');

// Caps locked with the user (2026-06-10):
//   - 10 MB per individual crop blob
//   - 100 MB total across all queued crops
// 4K screenshots can be 5–10 MB; 10 MB covers typical catalogue uploads.
// Total cap keeps a few oversized files from blowing the IDB quota
// (mobile Safari typically allows ~80–100 MB before silent eviction).
export const CROP_BLOB_MAX_BYTES = 10 * 1024 * 1024;
export const CROP_QUEUE_MAX_BYTES = 100 * 1024 * 1024;

export async function putCropBlob(key: string, blob: Blob): Promise<void> {
  await set(key, blob, cropBlobStore);
}

export async function getCropBlob(key: string): Promise<Blob | undefined> {
  return (await get(key, cropBlobStore)) as Blob | undefined;
}

export async function deleteCropBlob(key: string): Promise<void> {
  try {
    await del(key, cropBlobStore);
  } catch {
    /* swallow — orphan blob is preferable to surfacing storage errors */
  }
}

// Sum of all queued blob sizes. Used pre-enqueue to enforce the total
// quota — callers refuse new crops when adding would exceed the cap.
export async function getCropBlobTotalBytes(): Promise<number> {
  try {
    const all = (await values(cropBlobStore)) as Blob[];
    return all.reduce((sum, blob) => sum + (blob?.size ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function listCropBlobKeys(): Promise<string[]> {
  try {
    return (await keys(cropBlobStore)) as string[];
  } catch {
    return [];
  }
}

export interface QuotaCheckResult {
  ok: boolean;
  reason?: 'too-large' | 'queue-full';
  perBlobLimit: number;
  totalLimit: number;
}

export async function canQueueCropBlob(blobSize: number): Promise<QuotaCheckResult> {
  if (blobSize > CROP_BLOB_MAX_BYTES) {
    return { ok: false, reason: 'too-large', perBlobLimit: CROP_BLOB_MAX_BYTES, totalLimit: CROP_QUEUE_MAX_BYTES };
  }
  const currentTotal = await getCropBlobTotalBytes();
  if (currentTotal + blobSize > CROP_QUEUE_MAX_BYTES) {
    return { ok: false, reason: 'queue-full', perBlobLimit: CROP_BLOB_MAX_BYTES, totalLimit: CROP_QUEUE_MAX_BYTES };
  }
  return { ok: true, perBlobLimit: CROP_BLOB_MAX_BYTES, totalLimit: CROP_QUEUE_MAX_BYTES };
}

// Dedupe helper. Returns the previously-queued blobKey for a screenshot,
// if any. Caller deletes the old blob + removes the old mutation when
// queuing a new crop for the same screenshot — matches the user-locked
// 'newest crop wins' policy.
export function buildCropBlobKey(screenshotId: string, mutationId: string): string {
  return `${screenshotId}:${mutationId}`;
}

export function parseCropBlobKey(key: string): { screenshotId: string; mutationId: string } | null {
  const idx = key.indexOf(':');
  if (idx === -1) return null;
  return { screenshotId: key.slice(0, idx), mutationId: key.slice(idx + 1) };
}
