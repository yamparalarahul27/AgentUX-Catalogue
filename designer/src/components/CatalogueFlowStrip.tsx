import { useMemo } from 'react';

import type { ScreenshotNode } from '../types';
import { getScreenshotFlowLabel } from '../lib/catalogue-families';

interface CatalogueFlowStripProps {
  // Full-scope screenshots (not the paginated slice) so the strip
  // shows every flow that exists in the project, plus a true count
  // per flow regardless of what the current page contains.
  screenshots: ScreenshotNode[];
  filterFlow: string[];
  onToggleFlow: (flow: string) => void;
}

interface FlowChip {
  label: string;
  count: number;
}

function buildFlowChips(screenshots: ScreenshotNode[]): FlowChip[] {
  const counts = new Map<string, number>();
  for (const screenshot of screenshots) {
    const label = getScreenshotFlowLabel(screenshot);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function CatalogueFlowStrip({ screenshots, filterFlow, onToggleFlow }: CatalogueFlowStripProps) {
  // Both useMemo calls must run on every render — keep them before
  // any conditional return so React's hook-count stays stable.
  const chips = useMemo(() => buildFlowChips(screenshots), [screenshots]);
  const activeSet = useMemo(() => new Set(filterFlow), [filterFlow]);

  // Hide entirely when the project has no flows yet — empty strip
  // is just visual noise.
  if (chips.length === 0) return null;

  return (
    <div className="catalogue-flow-strip" role="group" aria-label="Flow filter">
      {chips.map((chip) => {
        const isActive = activeSet.has(chip.label);
        return (
          <button
            key={chip.label}
            type="button"
            className={`catalogue-flow-strip__chip ${isActive ? 'is-active' : ''}`}
            onClick={() => onToggleFlow(chip.label)}
            aria-pressed={isActive}
          >
            <span className="catalogue-flow-strip__label">{chip.label}</span>
            <span className="catalogue-flow-strip__count">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}
