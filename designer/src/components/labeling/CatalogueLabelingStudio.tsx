import { useEffect, useMemo, useRef, useState } from 'react';

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
  overrides: Map<string, ScreenshotLabel>;
  selectedScreenshotId: string | null;
  onCardClick: (screenshotId: string) => void;
  totals: StudioTotals;
  totalsLoading: boolean;
}

// How many cards to render on the first paint, and how many more to
// reveal each time the sentinel scrolls into view. The Studio receives
// the FULL unfiltered superset (~2,000+ screenshots today), so without
// internal pagination the grid mounts ~2,000 LabelingStudioCards in one
// React commit. 50 + 50 keeps the initial mount cheap and the
// infinite-scroll smooth as the user explores.
const PAGE_SIZE = 50;

export function CatalogueLabelingStudio({
  screenshots,
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

  // Local pagination state. Reset whenever the active chip changes so
  // each filter starts on page 1.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const visibleScreenshots = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) =>
            Math.min(current + PAGE_SIZE, filtered.length),
          );
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

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
            {visibleScreenshots.map((screenshot) => (
              <LabelingStudioCard
                key={screenshot.id}
                screenshot={screenshot}
                status={statusByScreenshotId.get(screenshot.id) ?? 'unlabeled'}
                isSelected={selectedScreenshotId === screenshot.id}
                onClick={() => onCardClick(screenshot.id)}
              />
            ))}
          </div>
          {hasMore && (
            <>
              <div ref={sentinelRef} className="labeling-studio__sentinel" aria-hidden="true" />
              <p className="labeling-studio__footnote">
                Showing {visibleScreenshots.length} of {filtered.length} · scroll for more
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
