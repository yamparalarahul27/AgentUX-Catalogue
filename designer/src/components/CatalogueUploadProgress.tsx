import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, X } from 'lucide-react';

import type { UploadProgressItem, UploadProgressStatus } from '../hooks/use-catalogue-upload';

interface Props {
  items: UploadProgressItem[];
  onDismiss: () => void;
  onRetryFailed: () => void;
}

const AUTO_DISMISS_MS = 2000;
const ITEM_LEAVE_MS = 380; // matches catalogue-upload-progress.scss timings

export function CatalogueUploadProgress({ items, onDismiss, onRetryFailed }: Props) {
  const ribbonRef = useRef<HTMLDivElement>(null);

  // Items just transitioned to 'uploaded' play a leaving animation
  // (blur + fade + scale + width-to-0) before being removed from the
  // ribbon entirely. Tracked in state so we can cleanly unmount once
  // the animation has played.
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const previousStatusRef = useRef<Map<string, UploadProgressStatus>>(new Map());

  useEffect(() => {
    const justUploaded: string[] = [];
    for (const item of items) {
      const previous = previousStatusRef.current.get(item.id);
      if (previous !== 'uploaded' && item.status === 'uploaded') {
        justUploaded.push(item.id);
      }
      previousStatusRef.current.set(item.id, item.status);
    }
    if (justUploaded.length === 0) return;

    setLeavingIds((previous) => {
      const next = new Set(previous);
      for (const id of justUploaded) next.add(id);
      return next;
    });
    // No effect cleanup: the timer must fire even when `items` changes
    // again before 380ms elapses (e.g., another upload starts/completes).
    // Returning a cleanup would clearTimeout this batch's removal, leaving
    // the IDs stuck in `leavingIds` — `visibleItems` would keep rendering
    // width-0 items whose 56px thumb height holds the ribbon (and card)
    // at full height long after everything finished.
    window.setTimeout(() => {
      setLeavingIds((previous) => {
        const next = new Set(previous);
        for (const id of justUploaded) next.delete(id);
        return next;
      });
    }, ITEM_LEAVE_MS);
  }, [items]);

  const counts = useMemo(() => {
    let uploaded = 0;
    let failed = 0;
    let uploading = 0;
    let queued = 0;
    for (const item of items) {
      if (item.status === 'uploaded') uploaded += 1;
      else if (item.status === 'failed') failed += 1;
      else if (item.status === 'uploading') uploading += 1;
      else queued += 1;
    }
    return { total: items.length, uploaded, failed, uploading, queued };
  }, [items]);

  // Items the user actually sees in the ribbon — successes vanish, but
  // items mid-animation stay until their transition finishes.
  const visibleItems = useMemo(
    () => items.filter((item) => item.status !== 'uploaded' || leavingIds.has(item.id)),
    [items, leavingIds],
  );

  const allDone = counts.total > 0 && counts.queued === 0 && counts.uploading === 0;
  const allDoneNoFailures = allDone && counts.failed === 0;

  // Auto-scroll the ribbon so the active (uploading) item stays visible
  // at the right edge — gives a sense of forward progress.
  useEffect(() => {
    if (!ribbonRef.current) return;
    const activeIndex = visibleItems.findIndex((item) => item.status === 'uploading');
    if (activeIndex < 0) return;
    const child = ribbonRef.current.children[activeIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
  }, [visibleItems]);

  // Auto-dismiss when all done with no failures — give the user 2s to see the win.
  useEffect(() => {
    if (!allDoneNoFailures) return;
    const timer = window.setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [allDoneNoFailures, onDismiss]);

  if (counts.total === 0) return null;

  const progressPercent = counts.total > 0 ? Math.round((counts.uploaded / counts.total) * 100) : 0;
  const showProgressBar = counts.total > 20;

  let headerText = '';
  if (allDoneNoFailures) {
    headerText = `All ${counts.uploaded} uploaded`;
  } else if (allDone) {
    headerText = `Uploaded ${counts.uploaded} · ${counts.failed} failed`;
  } else {
    const parts = [`Uploading ${counts.total} · ${counts.uploaded} done`];
    if (counts.failed > 0) parts.push(`${counts.failed} failed`);
    headerText = parts.join(' · ');
  }

  return (
    <div className="catalogue-upload-progress" role="status" aria-live="polite">
      <div className="catalogue-upload-progress__head">
        <span className="catalogue-upload-progress__title">
          {allDoneNoFailures && <Check size={14} aria-hidden="true" className="catalogue-upload-progress__title-icon" />}
          {headerText}
        </span>
        <div className="catalogue-upload-progress__actions">
          {counts.failed > 0 && (
            <button
              type="button"
              className="catalogue-upload-progress__retry"
              onClick={onRetryFailed}
              aria-label="Retry failed uploads"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Retry failed
            </button>
          )}
          <button
            type="button"
            className="catalogue-upload-progress__close"
            onClick={onDismiss}
            aria-label="Dismiss upload progress"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showProgressBar && (
        <div className="catalogue-upload-progress__bar" aria-hidden="true">
          <div
            className="catalogue-upload-progress__bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {visibleItems.length > 0 && (
        <div ref={ribbonRef} className="catalogue-upload-progress__ribbon">
          {visibleItems.map((item) => {
            const isLeaving = leavingIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`catalogue-upload-progress__item is-${item.status} ${isLeaving ? 'is-leaving' : ''}`}
                title={item.errorMessage ? `${item.fileName} — ${item.errorMessage}` : item.fileName}
              >
                <div className="catalogue-upload-progress__thumb">
                  <img src={item.previewUrl} alt="" loading="lazy" />
                  <span className="catalogue-upload-progress__badge" aria-hidden="true">
                    {item.status === 'uploading' && <Loader2 size={12} className="catalogue-upload-progress__spinner" />}
                    {item.status === 'failed' && <X size={12} />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
