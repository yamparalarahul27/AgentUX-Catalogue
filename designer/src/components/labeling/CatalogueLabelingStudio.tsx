import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

// 50 cards per page — the Studio receives the full unfiltered superset
// (~2,000+ screenshots) and rendering all in one commit was the perf
// hit reported by the user.
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
  const gridRef = useRef<HTMLDivElement | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const [page, setPage] = useState(0);

  // Reset to page 1 whenever the active status chip changes — otherwise
  // switching from "All" (page 3) to "Verified" (only 8 items, 1 page)
  // would leave the user on a phantom page 3 with an empty grid.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Clamp the current page if `filtered` shrinks below the current
  // page's range (e.g. after a delete that drops the last item).
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);

  const visibleScreenshots = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  );

  // When the user clicks a page tab, scroll the grid back to the top so
  // they're not left mid-scroll on a different set.
  function goToPage(next: number) {
    setPage(next);
    if (gridRef.current) {
      gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (viewportWidth < LABELING_STUDIO_MIN_VIEWPORT_PX) {
    return <LabelingStudioPlaceholder />;
  }

  const startIndex = page * PAGE_SIZE + 1;
  const endIndex = Math.min(startIndex + PAGE_SIZE - 1, filtered.length);

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
          <div ref={gridRef} className="labeling-studio__grid">
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
          <StudioPagination
            page={page}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalCount={filtered.length}
            onChange={goToPage}
          />
        </>
      )}
    </section>
  );
}

// Page tabs + range indicator. Shows up to MAX_PAGE_BUTTONS numbered
// buttons (with ellipses for long lists). Prev / Next disable at the
// extremes; clicking a number jumps directly to that page.
interface StudioPaginationProps {
  page: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalCount: number;
  onChange: (next: number) => void;
}

function StudioPagination({
  page,
  totalPages,
  startIndex,
  endIndex,
  totalCount,
  onChange,
}: StudioPaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <nav className="labeling-studio__pagination" aria-label="Studio pagination">
      <p className="labeling-studio__pagination-status">
        Showing <strong>{startIndex}</strong>–<strong>{endIndex}</strong> of <strong>{totalCount}</strong>
      </p>
      <div className="labeling-studio__pagination-controls" role="navigation">
        <button
          type="button"
          className="labeling-studio__page-btn labeling-studio__page-btn--nav"
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        {pageNumbers.map((entry, idx) => (
          entry === 'gap' ? (
            <span key={`gap-${idx}`} className="labeling-studio__page-gap" aria-hidden="true">…</span>
          ) : (
            <button
              type="button"
              key={entry}
              className={`labeling-studio__page-btn${entry === page ? ' is-active' : ''}`}
              onClick={() => onChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
            >
              {entry + 1}
            </button>
          )
        ))}
        <button
          type="button"
          className="labeling-studio__page-btn labeling-studio__page-btn--nav"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

// 1 … 4 5 [6] 7 8 … 42 style page-number list. Always shows first +
// last, the current page ±1, and ellipses for the gaps.
function buildPageNumbers(current: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const result: Array<number | 'gap'> = [];
  const window = new Set<number>([0, totalPages - 1, current, current - 1, current + 1]);
  const sorted = [...window]
    .filter((n) => n >= 0 && n < totalPages)
    .sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('gap');
    result.push(sorted[i]);
  }
  return result;
}
