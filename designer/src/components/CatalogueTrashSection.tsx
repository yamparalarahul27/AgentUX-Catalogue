import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';

import { useOnlineStatus } from '../hooks/use-online-status';
import { formatRelativeTime } from '../lib/relative-time';
import { supabase } from '../lib/supabase';
import type { ScreenshotNode } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { ThumbHashImage } from './ThumbHashImage';

interface CatalogueTrashSectionProps {
  onRestored?: () => void;
}

interface TrashFamily {
  id: string;
  name: string;
  group: string | null;
  flow: string | null;
  platforms: string[];
  thumbUrl: string | null;
  thumbHash: string | null;
  deletedAt: Date | null;
  deletedByEmail: string | null;
  screenshotIds: string[];
}

function getScreenshotFlowLabel(screenshot: ScreenshotNode): string | null {
  const meta = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!meta) return null;
  const value = meta.catalogue_flow_label;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function platformLabel(platform: string): string {
  if (platform === 'web') return 'Web';
  if (platform === 'mobile') return 'Mobile';
  return platform;
}

export function CatalogueTrashSection({ onRestored }: CatalogueTrashSectionProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  // Permanent-delete (storage purge) can't be queued — it's irreversible
  // and round-trips through an Edge Function that needs a live connection.
  // Disable while offline / unstable.
  const onlineStatus = useOnlineStatus();
  const networkBlocked = onlineStatus !== 'online';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: queryError } = await supabase
        .from('screenshots')
        .select('*')
        .not('deleted_at', 'is', null)
        .gt('deleted_at', fifteenDaysAgo)
        .order('deleted_at', { ascending: false });
      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }
      const withUrls = (data ?? []).map((row) => {
        const publicUrl = supabase.storage.from('screenshots').getPublicUrl(row.storage_path).data.publicUrl;
        return { ...row, image_url: publicUrl } as ScreenshotNode;
      });
      setScreenshots(withUrls);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // Post-Phase 4 of the screen_families removal: every screenshot is
  // its own Trash row. The old multi-variant grouping by screen_family_id
  // is gone with the column.
  const families = useMemo<TrashFamily[]>(() => {
    const groups = new Map<string, ScreenshotNode[]>();
    for (const screenshot of screenshots) {
      groups.set(screenshot.id, [screenshot]);
    }
    return Array.from(groups.entries()).map(([key, variants]) => {
      const first = variants[0];
      const platforms = [...new Set(variants.map((variant) => variant.platform).filter(Boolean) as string[])];
      const deletedAt = first.deleted_at ? new Date(first.deleted_at) : null;
      return {
        id: key,
        name: first.name,
        group: first.group,
        flow: getScreenshotFlowLabel(first),
        platforms,
        thumbUrl: first.image_url ?? null,
        thumbHash: first.thumb_hash ?? null,
        deletedAt,
        deletedByEmail: first.deleted_by_email ?? null,
        screenshotIds: variants.map((variant) => variant.id),
      };
    });
  }, [screenshots]);

  async function handleRestore(family: TrashFamily) {
    setRestoringIds((previous) => new Set(previous).add(family.id));
    setMessage(null);
    const { error: restoreError } = await supabase
      .from('screenshots')
      .update({ deleted_at: null, deleted_by_email: null })
      .in('id', family.screenshotIds);
    setRestoringIds((previous) => {
      const next = new Set(previous);
      next.delete(family.id);
      return next;
    });
    if (restoreError) {
      setMessage(`Restore failed: ${restoreError.message}`);
      return;
    }
    setScreenshots((previous) => previous.filter((screenshot) => !family.screenshotIds.includes(screenshot.id)));
    setMessage(`Restored "${family.name}".`);
    onRestored?.();
  }

  async function handleCleanOrphans() {
    setShowCleanConfirm(false);
    setIsCleaning(true);
    setMessage(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{
        bucket_objects: number;
        referenced_count: number;
        orphans_found: number;
        deleted: number;
        failures: { path: string; error: string }[];
      }>('purge-orphan-storage', { body: {} });

      if (invokeError) {
        setMessage(`Cleanup failed: ${invokeError.message}`);
        return;
      }
      if (!data) {
        setMessage('Cleanup failed: empty response.');
        return;
      }
      if (data.orphans_found === 0) {
        setMessage('No orphan files found. Storage is clean.');
        return;
      }
      const failureNote = data.failures.length > 0
        ? ` ${data.failures.length} could not be deleted.`
        : '';
      setMessage(`Cleaned ${data.deleted} orphan file${data.deleted === 1 ? '' : 's'} from storage.${failureNote}`);
    } catch (err) {
      setMessage(`Cleanup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setIsCleaning(false);
    }
  }

  const headerBar = (
    <div className="catalogue-team__trash-header">
      <button
        type="button"
        className="btn-secondary catalogue-team__trash-clean"
        onClick={() => setShowCleanConfirm(true)}
        disabled={isCleaning || networkBlocked}
        title={
          networkBlocked
            ? "You're offline — permanent deletes need a live connection"
            : 'Delete storage files that no DB row references'
        }
      >
        <Trash2 size={14} aria-hidden="true" />
        {isCleaning ? 'Cleaning…' : 'Clean orphaned storage'}
      </button>
    </div>
  );

  const cleanConfirm = showCleanConfirm ? (
    <ConfirmModal
      title="Clean orphaned storage?"
      message="This scans the screenshots bucket and permanently deletes any file no DB row references. It cannot remove anything still in active use or in Trash."
      confirmLabel="Clean now"
      cancelLabel="Cancel"
      danger
      onConfirm={() => { void handleCleanOrphans(); }}
      onCancel={() => setShowCleanConfirm(false)}
    />
  ) : null;

  if (loading) {
    return (
      <>
        {headerBar}
        <div className="catalogue-team__empty">Loading Trash…</div>
        {cleanConfirm}
      </>
    );
  }
  if (error) {
    return (
      <>
        {headerBar}
        <div className="catalogue-team__empty">Couldn't load Trash: {error}</div>
        {cleanConfirm}
      </>
    );
  }

  return (
    <>
      {headerBar}
      {message && <div className="catalogue-team__group-note">{message}</div>}
      {families.length === 0 ? (
        <div className="catalogue-team__empty">Trash is empty. Items you delete will appear here for 15 days.</div>
      ) : (
        <ul className="catalogue-team__trash-list">
          {families.map((family) => {
            const isRestoring = restoringIds.has(family.id);
            const subLineParts: string[] = [];
            if (family.group) subLineParts.push(family.group);
            if (family.flow) subLineParts.push(family.flow);
            if (family.platforms.length > 0) subLineParts.push(family.platforms.map(platformLabel).join(', '));
            return (
              <li key={family.id} className="catalogue-team__trash-row">
                <div className="catalogue-team__trash-thumb">
                  {family.thumbUrl && (
                    <ThumbHashImage
                      src={family.thumbUrl}
                      thumbHash={family.thumbHash}
                      alt={family.name}
                    />
                  )}
                </div>
                <div className="catalogue-team__trash-meta">
                  <div className="catalogue-team__trash-name">{family.name}</div>
                  {subLineParts.length > 0 && (
                    <div className="catalogue-team__trash-sub">{subLineParts.join(' · ')}</div>
                  )}
                  <div className="catalogue-team__trash-when">
                    deleted by {family.deletedByEmail || 'someone'}
                    {family.deletedAt && `, ${formatRelativeTime(family.deletedAt)}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary catalogue-team__trash-restore"
                  onClick={() => { void handleRestore(family); }}
                  disabled={isRestoring}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {isRestoring ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {cleanConfirm}
    </>
  );
}
