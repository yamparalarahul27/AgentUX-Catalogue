import { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
  type CatalogueGroupAppearanceMap,
} from '../lib/catalogue-group-appearance';

interface CatalogueDockChipProps {
  groupKey: string;
  projectId: string | null;
  count: number;
  isActive: boolean;
  // Stagger index used by the CSS animation-delay during page swap.
  // 0 = first to animate; last index = last to animate.
  staggerIndex: number;
  onClick: () => void;
  // Initial appearance map passed by the parent — keeps the chip
  // self-sufficient when appearances are loaded asynchronously.
  initialAppearanceMap: CatalogueGroupAppearanceMap;
}

export function CatalogueDockChip({
  groupKey,
  projectId,
  count,
  isActive,
  staggerIndex,
  onClick,
  initialAppearanceMap,
}: CatalogueDockChipProps) {
  const [appearanceMap, setAppearanceMap] = useState(initialAppearanceMap);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeCatalogueGroupAppearance(() => {
      setAppearanceMap(readCatalogueGroupAppearanceMap());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void ensureCatalogueGroupAppearanceLoaded(projectId);
  }, [projectId]);

  const appearance = resolveCatalogueGroupAppearance(appearanceMap, groupKey, projectId);
  const label = appearance.label || groupKey;
  const showImage = Boolean(appearance.iconUrl && !iconLoadFailed);
  const firstLetter = (label?.trim()?.[0] || '?').toUpperCase();

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          data-dock-chip
          data-group-key={groupKey}
          className={`catalogue-dock-chip${isActive ? ' is-active' : ''}`}
          style={{ '--stagger-idx': staggerIndex } as React.CSSProperties}
          onClick={onClick}
          aria-label={`${label} (${count} screenshots)`}
          aria-pressed={isActive}
        >
          {showImage ? (
            <img
              src={appearance.iconUrl || undefined}
              alt=""
              aria-hidden="true"
              onError={() => setIconLoadFailed(true)}
              draggable={false}
            />
          ) : (
            <span aria-hidden="true">{firstLetter}</span>
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="catalogue-dock-tooltip"
          sideOffset={12}
          collisionPadding={12}
        >
          <span>{label}</span>
          <span className="catalogue-dock-tooltip__count">· {count}</span>
          <Tooltip.Arrow className="catalogue-dock-tooltip__arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
