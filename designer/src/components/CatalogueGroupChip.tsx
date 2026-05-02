import { formatRelative /* , isWithinHours */ } from '../lib/catalogue-relative-time';

interface ResolvedAppearance {
  iconUrl: string | null;
  label: string | null;
}

interface CatalogueGroupChipProps {
  groupKey: string;
  count: number;
  lastAddedAt: string | null;
  appearance: ResolvedAppearance;
  active: boolean;
  recencyHours: number;
  onSelect: () => void;
}

export function CatalogueGroupChip({
  groupKey,
  count,
  lastAddedAt,
  appearance,
  active,
  // recencyHours intentionally unused — recency dot disabled.
  recencyHours: _recencyHours,
  onSelect,
}: CatalogueGroupChipProps) {
  const label = appearance.label || groupKey;
  // const recent = isWithinHours(lastAddedAt, _recencyHours);
  const relative = formatRelative(lastAddedAt);
  const tooltip = `${label} · ${count} screenshot${count === 1 ? '' : 's'}${relative ? ` · last added ${relative}` : ''}`;

  return (
    <button
      type="button"
      className={`catalogue-chip${active ? ' catalogue-chip--active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
      title={tooltip}
    >
      {appearance.iconUrl ? (
        <img src={appearance.iconUrl} alt="" aria-hidden="true" className="catalogue-chip__icon-img" />
      ) : null}
      <span className="catalogue-chip__label">{label}</span>
      <span className="catalogue-chip__count">{count}</span>
      {/* recent && <span className="catalogue-chip__recency-dot" aria-label="Recently added" /> */}
    </button>
  );
}
