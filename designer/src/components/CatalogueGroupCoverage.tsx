import type { GroupCoverage, PlatformCoverage } from '../lib/group-coverage';

interface CatalogueGroupCoverageProps {
  coverage: GroupCoverage;
  // 'compact' renders inline bars sized for the catalogue section header.
  // 'hero' renders the bigger version for /g/<key>.
  variant: 'compact' | 'hero';
}

function CoverageRow({ label, score, variant }: { label: string; score: PlatformCoverage; variant: 'compact' | 'hero' }) {
  return (
    <div className={`catalogue-group-coverage__row catalogue-group-coverage__row--${variant}`}>
      <span className="catalogue-group-coverage__label">{label}</span>
      <div className="catalogue-group-coverage__bar" role="progressbar" aria-valuenow={score.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} coverage`}>
        <span className="catalogue-group-coverage__fill" style={{ width: `${score.pct}%` }} />
      </div>
      <span className="catalogue-group-coverage__pct">{score.pct}%</span>
      {variant === 'hero' && score.targetFlows > 0 && (
        <span className="catalogue-group-coverage__caption">
          {score.flowsCaptured} / {score.targetFlows} flows
          {score.allVariants && <span className="catalogue-group-coverage__bonus" title="All variants captured (+5%)">✦</span>}
        </span>
      )}
    </div>
  );
}

export function CatalogueGroupCoverage({ coverage, variant }: CatalogueGroupCoverageProps) {
  if (!coverage.mobile && !coverage.web) return null;
  return (
    <div className={`catalogue-group-coverage catalogue-group-coverage--${variant}`}>
      {coverage.mobile && <CoverageRow label="Mobile" score={coverage.mobile} variant={variant} />}
      {coverage.web && <CoverageRow label="Web" score={coverage.web} variant={variant} />}
    </div>
  );
}
