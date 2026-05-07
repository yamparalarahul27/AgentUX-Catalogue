import { useEffect, useMemo, useRef } from 'react';

import type { ScreenshotNode } from '../../types';
import { LABELING_STUDIO_MIN_VIEWPORT_PX } from '../../lib/feature-flags';
import { useViewportWidth } from '../../hooks/use-viewport-width';
import { useLabelingStudioStatus } from '../../hooks/use-labeling-studio-status';
import type { ScreenshotLabel } from '../../lib/labeling/types';
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
}

export function CatalogueLabelingStudio({
  screenshots,
  hasMore,
  loadMore,
  loadingMore,
  overrides,
  selectedScreenshotId,
  onCardClick,
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

  const { filter, setFilter, buckets, filtered, statusByScreenshotId } =
    useLabelingStudioStatus(overlaidScreenshots);

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
          Structured metadata for retrieval and future agent context.
        </p>
      </header>

      <LabelingStudioStatusChips
        buckets={buckets}
        active={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <p className="labeling-studio__empty">
          No screenshots in this status. Try a different filter.
        </p>
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
