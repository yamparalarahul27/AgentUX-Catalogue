interface CatalogueSkeletonCardProps {
  variant: 'grid' | 'stack';
}

export function CatalogueSkeletonCard({ variant }: CatalogueSkeletonCardProps) {
  if (variant === 'stack') {
    return (
      <div className="catalogue-skeleton catalogue-skeleton--stack" aria-hidden="true">
        <div className="catalogue-skeleton__media" />
        <div className="catalogue-skeleton__panel">
          <div className="catalogue-skeleton__line catalogue-skeleton__line--title" />
          <div className="catalogue-skeleton__chip-row">
            <div className="catalogue-skeleton__chip" />
            <div className="catalogue-skeleton__chip" />
            <div className="catalogue-skeleton__chip" />
          </div>
          <div className="catalogue-skeleton__line" />
          <div className="catalogue-skeleton__line" />
          <div className="catalogue-skeleton__line catalogue-skeleton__line--short" />
        </div>
      </div>
    );
  }

  return (
    <div className="catalogue-skeleton catalogue-skeleton--grid" aria-hidden="true">
      <div className="catalogue-skeleton__image" />
      <div className="catalogue-skeleton__meta">
        <div className="catalogue-skeleton__line catalogue-skeleton__line--title" />
        <div className="catalogue-skeleton__line catalogue-skeleton__line--short" />
      </div>
    </div>
  );
}

interface CatalogueSkeletonListProps {
  variant: 'grid' | 'stack';
  count: number;
}

export function CatalogueSkeletonList({ variant, count }: CatalogueSkeletonListProps) {
  const items = Array.from({ length: count }, (_, index) => index);

  if (variant === 'stack') {
    return (
      <div className="catalogue-stack">
        {items.map((index) => <CatalogueSkeletonCard key={index} variant="stack" />)}
      </div>
    );
  }

  return (
    <div className="catalogue-skeleton-grid">
      {items.map((index) => <CatalogueSkeletonCard key={index} variant="grid" />)}
    </div>
  );
}
