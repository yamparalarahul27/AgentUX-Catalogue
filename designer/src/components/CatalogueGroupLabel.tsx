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
}

export function CatalogueGroupLabel({
  group,
  projectId = null,
  fallback = 'No group',
  className,
}: CatalogueGroupLabelProps) {
  const [appearanceMap, setAppearanceMap] = useState(readCatalogueGroupAppearanceMap);

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
  const label = appearance.label || fallback;

  return (
    <span className={className}>
      {appearance.iconUrl ? (
        <img
          src={appearance.iconUrl}
          alt=""
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            objectFit: 'contain',
            marginRight: 6,
            verticalAlign: '-2px',
          }}
        />
      ) : null}
      {!appearance.iconUrl && appearance.iconEmoji ? <span aria-hidden="true">{appearance.iconEmoji} </span> : null}
      {label}
    </span>
  );
}
