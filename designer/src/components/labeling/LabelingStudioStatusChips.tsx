import type { StudioStatusBucket, StudioStatusFilter } from '../../hooks/use-labeling-studio-status';

interface Props {
  buckets: StudioStatusBucket[];
  active: StudioStatusFilter;
  onChange: (next: StudioStatusFilter) => void;
}

export function LabelingStudioStatusChips({ buckets, active, onChange }: Props) {
  return (
    <div className="labeling-studio-status-chips" role="tablist" aria-label="Filter by label status">
      {buckets.map((bucket) => (
        <button
          key={bucket.key}
          type="button"
          role="tab"
          aria-selected={active === bucket.key}
          className={`catalogue-filter-chip labeling-studio-status-chip ${active === bucket.key ? 'is-active' : ''}`}
          onClick={() => onChange(bucket.key)}
        >
          {bucket.label}
          <span className="labeling-studio-status-chip__count">{bucket.count}</span>
        </button>
      ))}
    </div>
  );
}
