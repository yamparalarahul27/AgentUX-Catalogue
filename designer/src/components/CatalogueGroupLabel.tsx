import { useEffect, useMemo, useState } from 'react';

import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';

interface CatalogueGroupLabelProps {
  group: string | null | undefined;
  projectId?: string | null;
  fallback?: string;
  className?: string;
  iconSize?: number;
  // When true, render only the group icon — no label text. If no icon
  // is available, falls back to a small first-letter circle so the
  // visual anchor stays even when appearance hasn't loaded. Used by
  // the share page H1 where the title text is rendered separately.
  iconOnly?: boolean;
}

export function CatalogueGroupLabel({
  group,
  projectId = null,
  fallback = 'No group',
  className,
  iconSize = 14,
  iconOnly = false,
}: CatalogueGroupLabelProps) {
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);
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

  const appearance = useMemo(() => (
    resolveCatalogueGroupAppearance(appearanceMap, group, projectId)
  ), [appearanceMap, group, projectId]);

  useEffect(() => {
    setIconLoadFailed(false);
  }, [appearance.iconUrl]);

  const label = appearance.label || fallback;
  const shouldShowImage = Boolean(appearance.iconUrl && !iconLoadFailed);
  // First-letter fallback only used in iconOnly mode when no image
  // is available. Keeps a consistent visual anchor.
  const firstLetter = (label?.trim()?.[0] || '?').toUpperCase();

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {shouldShowImage ? (
        <img
          src={appearance.iconUrl || undefined}
          alt=""
          aria-hidden="true"
          onError={() => setIconLoadFailed(true)}
          style={{
            width: iconSize,
            height: iconSize,
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      ) : iconOnly ? (
        <span
          aria-hidden="true"
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: '50%',
            background: '#27272a',
            color: '#a1a1aa',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(10, Math.floor(iconSize * 0.55)),
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {firstLetter}
        </span>
      ) : null}
      {iconOnly ? null : (
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </span>
  );
}
