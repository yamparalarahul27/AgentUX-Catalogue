import { get, set } from 'idb-keyval';

import { deleteCropBlob, getCropBlob } from './crop-blob-store';
import { getNetworkStatus, subscribeNetworkStatus } from './network-status';
import { supabase } from './supabase';
import { invalidateCatalogueFullScopeCache } from '../hooks/use-catalogue-full-scope';

// Durable mutation queue. Each user action that's marked "queueable"
// (rename, edit-metadata, soft-delete, add-comment in PR 2) is enqueued
// the moment it's invoked AND applied optimistically to local React
// state. On the next 'online' event — or on app mount if we restored a
// queue from a previous session — the queue drains in `ts` order.
//
// On replay:
//   - ok        → remove from queue
//   - retry     → leave in queue, stop draining, wait for next online
//   - drop      → remove from queue (4xx app error — can't be retried),
//                 console.warn so the developer notices
//
// Conflict policy: last-write-wins, silent. We don't have an
// updated_at column on `screenshots` to detect "the server's newer
// than your queued edit" — when we add that (PR 2.1 if ever needed)
// we can revisit and surface a toast.

const STORAGE_KEY = 'agentux:mutation-queue';

// Mutations are modelled at the user-action level, not the SQL level —
// "rename a family" writes to every variant in the family. Post-Phase 5
// of the screen_families removal, every family corresponds to exactly
// one row in `screenshots`, so the previous dual-write to a
// `screen_families` table is gone.
//
// `flow_id` is intentionally not part of FamilyPatch: flow assignment
// lives in `metadata.catalogue_flow_label` per screenshot (see
// handleSetFlowLabel + the screenshots-patch op).
export type FamilyPatch = {
  name?: string;
  group?: string | null;
};

export type QueuedMutation =
  | {
      id: string;
      op: 'family-patch';
      ts: number;
      // True when the mutation was enqueued while the network was
      // offline / unstable. Drives the indicator's syncing-pill
      // suppression for fast online drains.
      enqueuedOffline: boolean;
      familyId: string;
      // Snapshot of which screenshots belong to the family at enqueue
      // time. Replay updates exactly these rows; new uploads added
      // mid-offline would not inherit the rename until the next user
      // action touches them (acceptable for v1; rare in practice).
      screenshotIds: string[];
      patch: FamilyPatch;
    }
  | {
      id: string;
      op: 'soft-delete-family';
      ts: number;
      enqueuedOffline: boolean;
      familyId: string;
      screenshotIds: string[];
      deletedByEmail: string | null;
    }
  | {
      id: string;
      op: 'add-comment';
      ts: number;
      enqueuedOffline: boolean;
      screenshotId: string;
      text: string;
      userEmail: string;
      // Stable id picked client-side so the optimistic UI render can
      // reconcile with the server row when replay completes.
      clientId: string;
    }
  // Per-screenshot updates that don't fit the family-level shape — flow
  // (metadata.catalogue_flow_label per screenshot), theme/platform/
  // variant column updates. Each entry may patch columns AND/OR merge
  // into the metadata JSONB. Both are applied in one UPDATE so the
  // replay round-trips once per screenshot, not twice.
  | {
      id: string;
      op: 'screenshots-patch';
      ts: number;
      enqueuedOffline: boolean;
      updates: Array<{
        screenshotId: string;
        columnPatch?: Record<string, unknown>;
        // Merged into existing metadata at replay time. The local
        // optimistic update must already have applied this merge.
        metadataMerge?: Record<string, unknown>;
      }>;
    }
  // Image crop. The cropped Blob is stored in a separate IDB store
  // (lib/crop-blob-store.ts) keyed by `blobKey`; this record holds
  // the metadata needed to replay the storage upload + row update.
  // Annotation adjustments are intentionally NOT queued for v1 —
  // crops on screenshots with annotations may leave them slightly off-
  // position offline; documented limitation.
  | {
      id: string;
      op: 'crop';
      ts: number;
      enqueuedOffline: boolean;
      screenshotId: string;
      blobKey: string;
      blobSize: number;
      newStoragePath: string;
      thumbHash: string | null;
      oldStoragePath: string | null;
    };

// In-memory mirror of the queue. The async IDB read on module load
// hydrates this from disk; subsequent reads and subscriber notifications
// use this list directly so callers don't need to await IDB for the
// indicator's queue-size pill to update.
let queue: QueuedMutation[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const sizeSubscribers = new Set<(size: number, offlineSize: number) => void>();
let replayInProgress = false;
// Track the transition from "queue had items" → "queue is empty after a
// drain" so the indicator can surface the transient "Synced all" pill.
const drainSubscribers = new Set<() => void>();

function countOffline(): number {
  let n = 0;
  for (const item of queue) if (item.enqueuedOffline) n++;
  return n;
}

function notifySize() {
  const offlineSize = countOffline();
  for (const listener of sizeSubscribers) listener(queue.length, offlineSize);
}

function notifyDrained() {
  for (const listener of drainSubscribers) listener();
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = (await get(STORAGE_KEY)) as QueuedMutation[] | undefined;
      if (Array.isArray(raw)) queue = raw;
    } catch {
      /* swallow — empty queue is a safe default */
    }
    hydrated = true;
    notifySize();
  })();
  return hydratePromise;
}

async function persist(): Promise<void> {
  try {
    await set(STORAGE_KEY, queue);
  } catch {
    /* swallow — write failure is non-critical; in-memory queue still works */
  }
}

export function getQueueSize(): number {
  return queue.length;
}

export function getOfflineQueueSize(): number {
  return countOffline();
}

export function subscribeQueueSize(
  listener: (size: number, offlineSize: number) => void,
): () => void {
  sizeSubscribers.add(listener);
  // Fire once with the current value so subscribers don't need a
  // separate initial-read step.
  listener(queue.length, countOffline());
  return () => sizeSubscribers.delete(listener);
}

export function subscribeQueueDrained(listener: () => void): () => void {
  drainSubscribers.add(listener);
  return () => drainSubscribers.delete(listener);
}

// Input shape for enqueue — every variant of QueuedMutation minus the
// auto-generated `id` and `ts` fields. Written out as a discriminated
// union (rather than Omit<QueuedMutation, …>) so TypeScript preserves
// the per-op exhaustiveness checks at call sites.
export type EnqueueMutationInput =
  | {
      op: 'family-patch';
      familyId: string;
      screenshotIds: string[];
      patch: FamilyPatch;
    }
  | {
      op: 'soft-delete-family';
      familyId: string;
      screenshotIds: string[];
      deletedByEmail: string | null;
    }
  | {
      op: 'add-comment';
      screenshotId: string;
      text: string;
      userEmail: string;
      clientId: string;
    }
  | {
      op: 'screenshots-patch';
      updates: Array<{
        screenshotId: string;
        columnPatch?: Record<string, unknown>;
        metadataMerge?: Record<string, unknown>;
      }>;
    }
  | {
      op: 'crop';
      screenshotId: string;
      blobKey: string;
      blobSize: number;
      newStoragePath: string;
      thumbHash: string | null;
      oldStoragePath: string | null;
    };

// Append a mutation. Callers must have already applied the optimistic
// change to local state — the queue is the persistence layer, not the
// orchestrator of UI updates.
export async function enqueueMutation(mutation: EnqueueMutationInput): Promise<void> {
  await hydrate();
  // Snapshot the network status at enqueue time so the indicator can
  // distinguish "this came in while you were offline" (worth surfacing
  // 'Syncing' on reconnect) from "you're online and we're round-tripping
  // a normal write" (should drain silently in ~100ms).
  const enqueuedOffline = getNetworkStatus() !== 'online';
  const enriched = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    enqueuedOffline,
    ...mutation,
  } as QueuedMutation;
  // Newest-crop-wins policy: a fresh crop on the same screenshot
  // supersedes any still-pending crop. Drop the older queued entry +
  // delete its blob to keep IDB tidy and avoid a wasteful intermediate
  // upload during replay.
  if (enriched.op === 'crop') {
    const stale = queue.filter(
      (m) => m.op === 'crop' && m.screenshotId === enriched.screenshotId,
    );
    if (stale.length > 0) {
      for (const m of stale) {
        if (m.op === 'crop') await deleteCropBlob(m.blobKey);
      }
      queue = queue.filter(
        (m) => !(m.op === 'crop' && m.screenshotId === enriched.screenshotId),
      );
    }
  }
  queue = [...queue, enriched];
  await persist();
  notifySize();
  // Fire-and-forget replay so a mutation invoked while online drains
  // immediately. If offline, this returns early on the first network
  // failure and the queue waits for the next 'online' event.
  void replayQueue();
}

// Drain the queue. Safe to call concurrently — guarded by
// replayInProgress so only one replay loop runs at a time.
export async function replayQueue(): Promise<void> {
  await hydrate();
  if (replayInProgress) return;
  if (queue.length === 0) return;
  // Don't attempt replay while offline / unstable. Supabase's JS client
  // returns network failures as `{ error }` objects (NOT thrown), and
  // those errors are easy to misclassify as app errors that should be
  // dropped. Gating here is simpler + more reliable than trying to
  // discriminate network-vs-app errors after the fact.
  if (getNetworkStatus() !== 'online') return;
  replayInProgress = true;
  let didDrain = false;
  // Only surface the transient 'Synced all' pill when the drain
  // included at least one offline-enqueued mutation. Quick online
  // round-trips don't deserve a toast — they're invisible work.
  let drainedAnyOfflineMutation = false;
  try {
    // Snapshot at start; if new items are enqueued mid-drain they'll be
    // picked up on the next replayQueue() invocation (every enqueue
    // triggers one).
    const sorted = [...queue].sort((a, b) => a.ts - b.ts);
    for (const mutation of sorted) {
      const outcome = await applyMutation(mutation);
      if (outcome === 'retry') {
        // Network failure — stop draining, leave the rest in the queue
        // for the next 'online' event to retry.
        break;
      }
      if (mutation.enqueuedOffline) drainedAnyOfflineMutation = true;
      // ok | drop → remove from queue and persist.
      queue = queue.filter((m) => m.id !== mutation.id);
      await persist();
      notifySize();
      if (queue.length === 0) didDrain = true;
    }
  } finally {
    replayInProgress = false;
    if (didDrain) {
      // Refresh the IndexedDB-backed catalogue cache so the next reload
      // hydrates from authoritative server data, not the stale snapshot
      // that was written before these mutations landed. Without this,
      // a rename → reload sequence would briefly show the OLD name
      // (IDB seed) before the live fetch returns the new one — users
      // perceived "the change vanished."
      invalidateCatalogueFullScopeCache();
      if (drainedAnyOfflineMutation) notifyDrained();
    }
  }
}

type MutationOutcome = 'ok' | 'retry' | 'drop';

// Supabase's JS client folds network failures into `{ error }` objects
// rather than throwing. Detect those so we don't accidentally treat
// "the wifi is dead" as "the server rejected this request" and drop a
// queued mutation. The shape is: empty code + a message like "TypeError:
// Failed to fetch" (browser-specific phrasing varies).
function isNetworkError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && error.code !== '') return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('typeerror')
  );
}

async function applyMutation(mutation: QueuedMutation): Promise<MutationOutcome> {
  try {
    switch (mutation.op) {
      case 'family-patch': {
        // Post-Phase 5 of the screen_families removal: every familyId
        // is a synthetic `legacy-family-<uuid>` prefix, and the only
        // backing storage is the `screenshots` table. The old branch
        // that also updated `screen_families` is gone with the table.
        if (mutation.screenshotIds.length === 0) return 'ok';
        const screenshotPatch: Record<string, unknown> = {};
        if (mutation.patch.name !== undefined) screenshotPatch.name = mutation.patch.name;
        if (mutation.patch.group !== undefined) screenshotPatch.group = mutation.patch.group;
        if (Object.keys(screenshotPatch).length === 0) return 'ok';
        const { error } = await supabase
          .from('screenshots')
          .update(screenshotPatch)
          .in('id', mutation.screenshotIds);
        if (error) {
          if (isNetworkError(error)) return 'retry';
          console.warn('[mutation-queue] family-patch (screenshots) error:', error);
          return 'drop';
        }
        return 'ok';
      }
      case 'soft-delete-family': {
        if (mutation.screenshotIds.length === 0) return 'ok';
        const { error } = await supabase
          .from('screenshots')
          .update({
            deleted_at: new Date(mutation.ts).toISOString(),
            deleted_by_email: mutation.deletedByEmail,
          })
          .in('id', mutation.screenshotIds)
          .is('deleted_at', null);
        if (error) {
          if (isNetworkError(error)) return 'retry';
          console.warn('[mutation-queue] soft-delete-family app error:', error);
          return 'drop';
        }
        return 'ok';
      }
      case 'screenshots-patch': {
        // Per-screenshot updates — both column writes and metadata
        // JSONB merges. We re-read the current metadata before merging
        // so any concurrent changes (e.g. another flow update by a
        // different user) don't get clobbered by a stale snapshot the
        // optimistic UI captured. If the row is gone (deleted while
        // queued) we silently skip that entry.
        let anySuccess = false;
        for (const update of mutation.updates) {
          try {
            const columnPatch = update.columnPatch ?? {};
            let combinedPatch: Record<string, unknown> = { ...columnPatch };
            if (update.metadataMerge && Object.keys(update.metadataMerge).length > 0) {
              // Fetch current metadata so the merge is against the
              // latest server state — protects against parallel writes
              // to other metadata keys.
              const current = await supabase
                .from('screenshots')
                .select('metadata')
                .eq('id', update.screenshotId)
                .maybeSingle();
              if (current.error) {
                if (isNetworkError(current.error)) return 'retry';
                console.warn('[mutation-queue] screenshots-patch (read metadata) error:', current.error);
                continue;
              }
              const existing = (current.data?.metadata && typeof current.data.metadata === 'object')
                ? (current.data.metadata as Record<string, unknown>)
                : {};
              combinedPatch = {
                ...combinedPatch,
                metadata: { ...existing, ...update.metadataMerge },
              };
            }
            if (Object.keys(combinedPatch).length === 0) {
              anySuccess = true;
              continue;
            }
            const { error } = await supabase
              .from('screenshots')
              .update(combinedPatch)
              .eq('id', update.screenshotId);
            if (!error) {
              anySuccess = true;
            } else if (isNetworkError(error)) {
              return 'retry';
            } else {
              console.warn('[mutation-queue] screenshots-patch (update) error:', error);
            }
          } catch (err) {
            console.warn('[mutation-queue] screenshots-patch threw:', err);
            return 'retry';
          }
        }
        return anySuccess ? 'ok' : 'drop';
      }
      case 'crop': {
        // Two-stage: storage upload of the blob THEN row update with
        // the new storage_path. If the row update fails, roll back
        // the storage object to avoid orphans.
        const blob = await getCropBlob(mutation.blobKey);
        if (!blob) {
          // Lost the blob (manual IDB clear, browser eviction, etc.).
          // Can't recover — drop the mutation.
          console.warn('[mutation-queue] crop blob missing for', mutation.id);
          return 'drop';
        }
        let uploadError: { code?: string; message?: string } | null = null;
        try {
          const result = await supabase.storage
            .from('screenshots')
            .upload(mutation.newStoragePath, blob);
          uploadError = result.error as { code?: string; message?: string } | null;
        } catch (err) {
          console.warn('[mutation-queue] crop upload threw:', err);
          return 'retry';
        }
        if (uploadError) {
          if (isNetworkError(uploadError)) return 'retry';
          console.warn('[mutation-queue] crop upload error:', uploadError);
          return 'drop';
        }
        // Row update. Mirror the existing online path's thumb_hash
        // fallback (handles PostgREST schema-cache race).
        const patch: Record<string, unknown> = { storage_path: mutation.newStoragePath };
        if (mutation.thumbHash) patch.thumb_hash = mutation.thumbHash;
        let dbError: { code?: string; message?: string } | null = null;
        try {
          const result = await supabase
            .from('screenshots')
            .update(patch)
            .eq('id', mutation.screenshotId);
          dbError = result.error;
          if (dbError && /thumb_hash/i.test(dbError.message || '')) {
            const retry = await supabase
              .from('screenshots')
              .update({ storage_path: mutation.newStoragePath })
              .eq('id', mutation.screenshotId);
            dbError = retry.error;
          }
        } catch (err) {
          console.warn('[mutation-queue] crop row update threw:', err);
          return 'retry';
        }
        if (dbError) {
          if (isNetworkError(dbError)) return 'retry';
          // Row update failed — roll back the just-uploaded object so
          // we don't leak orphans in storage.
          void supabase.storage.from('screenshots').remove([mutation.newStoragePath]);
          console.warn('[mutation-queue] crop row update error:', dbError);
          return 'drop';
        }
        // Success — clean up the IDB blob + the previous storage object.
        await deleteCropBlob(mutation.blobKey);
        if (mutation.oldStoragePath) {
          void supabase.storage.from('screenshots').remove([mutation.oldStoragePath]);
        }
        return 'ok';
      }
      case 'add-comment': {
        // Insert with the client-supplied id so the row matches the
        // optimistic comment already in local state. If the row already
        // exists (replay ran twice) the unique-constraint error is
        // surfaced as a success — the comment is already saved.
        const { error } = await supabase
          .from('screenshot_comments')
          .insert({
            id: mutation.clientId,
            screenshot_id: mutation.screenshotId,
            text: mutation.text,
            user_email: mutation.userEmail,
          });
        if (error) {
          if (isNetworkError(error)) return 'retry';
          // 23505 = unique_violation → already inserted on a previous
          // (partial) replay. Treat as success.
          if (error.code === '23505') return 'ok';
          console.warn('[mutation-queue] add-comment app error:', error);
          return 'drop';
        }
        return 'ok';
      }
    }
  } catch (err) {
    // Thrown error = network failure (caught + reported by the wrapped
    // fetch in lib/supabase.ts). Leave the item queued for retry.
    console.warn('[mutation-queue] replay network error, will retry:', err);
    return 'retry';
  }
}

// Module-load hydrate kicks off so the queue size is available to the
// indicator pill almost immediately (within the first IDB read). If
// hydration finds queued items left over from a previous session, kick
// off a replay immediately (gated on online inside replayQueue).
void hydrate().then(() => {
  if (queue.length > 0) void replayQueue();
});

// Replay whenever the network tracker reports we're back online. This
// covers both the basic "WiFi came back" transition (caught by the
// browser's `online` event upstream of the tracker) AND the recovery
// from 'unstable' state where the radio never dropped but recent
// fetches were failing.
if (typeof window !== 'undefined') {
  subscribeNetworkStatus((status) => {
    if (status === 'online') void replayQueue();
  });

  // Safety net: poll every 15s. If event-driven replay missed (e.g.
  // because the browser fired 'online' before the subscriber attached,
  // or HMR reloaded the module mid-cycle), this catches up. Gated on
  // queue having items + online so it's a no-op in steady state.
  setInterval(() => {
    if (queue.length > 0 && getNetworkStatus() === 'online') {
      void replayQueue();
    }
  }, 15_000);
}
