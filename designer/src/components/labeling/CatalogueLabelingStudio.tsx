import { useEffect, useMemo, useRef } from 'react';

import type { ScreenshotNode } from '../../types';
import { LABELING_STUDIO_MIN_VIEWPORT_PX } from '../../lib/feature-flags';
import { useViewportWidth } from '../../hooks/use-viewport-width';
import { useLabelingStudioStatus } from '../../hooks/use-labeling-studio-status';
import type { StudioTotals } from '../../hooks/use-labeling-studio-totals';
import type { ScreenshotLabel } from '../../lib/labeling/types';
import notFoundIllustration from '../../assets/not-found.svg';
import { LabelingStudioCard } from './LabelingStudioCard';
import { LabelingStudioStatusChips } from './LabelingStudioStatusChips';
import { LabelingStudioPlaceholder } from './LabelingStudioPlaceholder';

interface Props {
  screenshots: ScreenshotNode[];
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  overrides: Map<string, ScreenshotLabel>;
  selectedScreenshotId: string | null;
  onCardClick: (screenshotId: string) => void;
  totals: StudioTotals;
  totalsLoading: boolean;
}

export function CatalogueLabelingStudio({
  screenshots,
  hasMore,
  loadMore,
  loadingMore,
  overrides,
  selectedScreenshotId,
  onCardClick,
  totals,
  totalsLoading,
}: Props) {
  const viewportWidth = useViewportWidth();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const overlaidScreenshots = useMemo(() => {
    if (overrides.size === 0) return screenshots;
    return screenshots.map((screenshot) => {
      const override = overrides.get(screenshot.id);
      if (!override) return screenshot;
      const metadata = (screenshot.metadata as Record<string, unknown>) ?? {};
      return { ...screenshot, metadata: { ...metadata, label: override } };
    });
  }, [overrides, screenshots]);

  const { filter, setFilter, buckets: loadedBuckets, filtered, statusByScreenshotId } =
    useLabelingStudioStatus(overlaidScreenshots);

  // Replace each chip's count with the database total. Filtering remains based
  // on the loaded set (filtered grid) — totals are display-only.
  const buckets = useMemo(
    () => loadedBuckets.map((bucket) => ({ ...bucket, count: totals[bucket.key] })),
    [loadedBuckets, totals],
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  if (viewportWidth < LABELING_STUDIO_MIN_VIEWPORT_PX) {
    return <LabelingStudioPlaceholder />;
  }

  return (
    <section className="labeling-studio">
      <header className="labeling-studio__header">
        <h1 className="labeling-studio__title">Labelling Studio</h1>
        <p className="labeling-studio__subtitle">
          {totalsLoading
            ? 'Loading totals…'
            : `${totals.all} screenshot${totals.all === 1 ? '' : 's'} · ${totals.verified} verified · ${totals.unlabeled} unlabelled`}
        </p>
      </header>

      <LabelingStudioStatusChips
        buckets={buckets}
        active={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <div className="labeling-studio__empty">
          <img src={notFoundIllustration} alt="" className="empty-state__illustration" />
          <p>No screenshots in this status. Try a different filter.</p>
        </div>
      ) : (
        <>
          <div className="labeling-studio__grid">
            {filtered.map((screenshot) => (
              <LabelingStudioCard
                key={screenshot.id}
                screenshot={screenshot}
                status={statusByScreenshotId.get(screenshot.id) ?? 'unlabeled'}
                isSelected={selectedScreenshotId === screenshot.id}
                onClick={() => onCardClick(screenshot.id)}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="labeling-studio__sentinel" aria-hidden="true" />
          {loadingMore && (
            <p className="labeling-studio__footnote">Loading more…</p>
          )}
        </>
      )}
    </section>
  );
}
