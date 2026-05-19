import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  // When provided, the label renders as a clickable element that
  // navigates to the given route. Click is stopPropagation'd so the
  // surrounding card / row click handler doesn't also fire. Currently
  // used on catalogue cards to jump to `/g/<groupKey>`; leave undefined
  // on read-only surfaces (share page H1, modal header, etc.).
  linkTo?: string;
}

export function CatalogueGroupLabel({
  group,
  projectId = null,
  fallback = 'No group',
  className,
  iconSize = 14,
  iconOnly = false,
  linkTo,
}: CatalogueGroupLabelProps) {
  const navigate = useNavigate();
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

  const inner = (
    <>
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
    </>
  );

  if (linkTo) {
    return (
      <button
        type="button"
        className={`catalogue-group-label catalogue-group-label--linked ${className || ''}`}
        onClick={(event) => {
          event.stopPropagation();
          navigate(linkTo);
        }}
        title={iconOnly ? label : undefined}
        aria-label={iconOnly ? label : undefined}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {inner}
    </span>
  );
}
