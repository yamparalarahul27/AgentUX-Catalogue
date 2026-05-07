import { useCallback, useMemo, useState } from 'react';

import type { ScreenshotNode } from '../../types';
import { LABELING_STUDIO_MIN_VIEWPORT_PX } from '../../lib/feature-flags';
import { useViewportWidth } from '../../hooks/use-viewport-width';
import { useLabelingStudioStatus } from '../../hooks/use-labeling-studio-status';
import type { ScreenshotLabel } from '../../lib/labeling/types';
import { LabelingStudioCard } from './LabelingStudioCard';
import { LabelingStudioStatusChips } from './LabelingStudioStatusChips';
import { LabelingStudioPlaceholder } from './LabelingStudioPlaceholder';
import { LabelEditor } from './LabelEditor';

interface Props {
  screenshots: ScreenshotNode[];
  userEmail: string | null;
}

export function CatalogueLabelingStudio({ screenshots, userEmail }: Props) {
  const viewportWidth = useViewportWidth();
  const [overrides, setOverrides] = useState<Map<string, ScreenshotLabel>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Overlay locally-saved labels so cards reflect the new status without a refetch.
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

  const handleLabelPersisted = useCallback((id: string, label: ScreenshotLabel) => {
    setOverrides((previous) => {
      const next = new Map(previous);
      next.set(id, label);
      return next;
    });
  }, []);

  const selectedIndex = useMemo(
    () => (selectedId ? filtered.findIndex((screenshot) => screenshot.id === selectedId) : -1),
    [filtered, selectedId],
  );

  const selectedScreenshot = selectedIndex >= 0 ? filtered[selectedIndex] : null;

  const handlePrev = useMemo(() => {
    if (selectedIndex <= 0) return null;
    return () => setSelectedId(filtered[selectedIndex - 1].id);
  }, [filtered, selectedIndex]);

  const handleNext = useMemo(() => {
    if (selectedIndex < 0 || selectedIndex >= filtered.length - 1) return null;
    return () => setSelectedId(filtered[selectedIndex + 1].id);
  }, [filtered, selectedIndex]);

  if (viewportWidth < LABELING_STUDIO_MIN_VIEWPORT_PX) {
    return <LabelingStudioPlaceholder />;
  }

  return (
    <section className={`labeling-studio ${selectedScreenshot ? 'is-editor-open' : ''}`}>
      <div className="labeling-studio__main">
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
                isSelected={selectedId === screenshot.id}
                onClick={() => setSelectedId(screenshot.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedScreenshot && (
        <LabelEditor
          key={selectedScreenshot.id}
          screenshot={selectedScreenshot}
          userEmail={userEmail}
          onClose={() => setSelectedId(null)}
          onPrev={handlePrev}
          onNext={handleNext}
          onLabelPersisted={handleLabelPersisted}
        />
      )}
    </section>
  );
}
