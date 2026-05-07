import type { ScreenshotNode } from '../../types';
import { LABELING_STUDIO_MIN_VIEWPORT_PX } from '../../lib/feature-flags';
import { useViewportWidth } from '../../hooks/use-viewport-width';
import { useLabelingStudioStatus } from '../../hooks/use-labeling-studio-status';
import { LabelingStudioCard } from './LabelingStudioCard';
import { LabelingStudioStatusChips } from './LabelingStudioStatusChips';
import { LabelingStudioPlaceholder } from './LabelingStudioPlaceholder';

interface Props {
  screenshots: ScreenshotNode[];
}

export function CatalogueLabelingStudio({ screenshots }: Props) {
  const viewportWidth = useViewportWidth();
  const { filter, setFilter, buckets, filtered, statusByScreenshotId } =
    useLabelingStudioStatus(screenshots);

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
        <div className="labeling-studio__grid">
          {filtered.map((screenshot) => (
            <LabelingStudioCard
              key={screenshot.id}
              screenshot={screenshot}
              status={statusByScreenshotId.get(screenshot.id) ?? 'unlabeled'}
            />
          ))}
        </div>
      )}

      <p className="labeling-studio__footnote">
        Cards are display-only in this phase. Editor opens in the next phase.
      </p>
    </section>
  );
}
