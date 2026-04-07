import {
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
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
  const appearance = resolveCatalogueGroupAppearance(
    readCatalogueGroupAppearanceMap(),
    group,
    projectId,
  );
  const label = appearance.label || fallback;

  return (
    <span className={className}>
      {appearance.icon ? <span aria-hidden="true">{appearance.icon} </span> : null}
      {label}
    </span>
  );
}
