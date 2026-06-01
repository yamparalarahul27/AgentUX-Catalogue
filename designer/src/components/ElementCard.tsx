import { Link } from 'react-router-dom';

import { elementDetailUrl, type ElementCatalogEntry } from '../lib/element-catalog';
import { ThumbHashImage } from './ThumbHashImage';

interface ElementCardProps {
  entry: ElementCatalogEntry;
}

// Single card in the /elements browse grid. 4-up sample strip (one
// per distinct group) above the name + count.
export function ElementCard({ entry }: ElementCardProps) {
  return (
    <Link
      to={elementDetailUrl(entry.kind, entry.slug)}
      className={`element-card element-card--${entry.kind}`}
    >
      <div className="element-card__strip">
        {entry.samples.length === 0 ? (
          // No samples (shouldn't happen — catalog only includes
          // elements with at least one screenshot) — render an empty
          // strip so layout doesn't collapse.
          <div className="element-card__sample element-card__sample--empty" />
        ) : (
          entry.samples.map((shot) => (
            <div key={shot.id} className="element-card__sample">
              {shot.image_url ? (
                <ThumbHashImage
                  src={shot.image_url}
                  thumbHash={shot.thumb_hash ?? null}
                  alt=""
                />
              ) : null}
            </div>
          ))
        )}
      </div>
      <div className="element-card__body">
        <span className="element-card__name">
          <span className={`element-card__kind-dot element-card__kind-dot--${entry.kind}`} aria-hidden="true" />
          {entry.name}
        </span>
        <span className="element-card__count">
          {entry.screenshots.length} {entry.screenshots.length === 1 ? 'screen' : 'screens'}
        </span>
      </div>
    </Link>
  );
}
