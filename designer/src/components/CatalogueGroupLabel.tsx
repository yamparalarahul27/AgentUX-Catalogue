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
}

export function CatalogueGroupLabel({
  group,
  projectId = null,
  fallback = 'No group',
  className,
  iconSize = 14,
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
      ) : null}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  );
}
