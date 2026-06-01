import { Link } from 'react-router-dom';

import {
  elementDetailUrl,
  getElementBbox,
  type ElementCatalogEntry,
} from '../lib/element-catalog';
import type { ElementViewMode } from '../hooks/use-element-view-mode';
import { CroppedImage } from './CroppedImage';
import { ThumbHashImage } from './ThumbHashImage';

interface ElementCardProps {
  entry: ElementCatalogEntry;
  viewMode: ElementViewMode;
}

// Single card in the /elements browse grid. 4-up sample strip (one
// per distinct group, preferring screenshots with bbox anchors)
// above the name + count. In Cropped mode each sample renders just
// the bbox region for this element; samples without an anchor show
// the "no anchor" hatched placeholder.
export function ElementCard({ entry, viewMode }: ElementCardProps) {
  return (
    <Link
      to={elementDetailUrl(entry.kind, entry.slug)}
      className={`element-card element-card--${entry.kind}`}
    >
      <div className="element-card__strip">
        {entry.samples.length === 0 ? (
          <div className="element-card__sample element-card__sample--empty" />
        ) : (
          entry.samples.map((shot) => {
            const bbox = viewMode === 'cropped' ? getElementBbox(shot, entry.name) : null;
            if (viewMode === 'cropped' && !bbox) {
              return (
                <div key={shot.id} className="element-card__sample element-card__sample--no-anchor">
                  <span>no anchor</span>
                </div>
              );
            }
            if (viewMode === 'cropped' && bbox && shot.image_url) {
              return (
                <CroppedImage
                  key={shot.id}
                  src={shot.image_url}
                  bbox={bbox}
                  className="element-card__sample element-card__sample--cropped"
                />
              );
            }
            return (
              <div key={shot.id} className="element-card__sample">
                {shot.image_url ? (
                  <ThumbHashImage
                    src={shot.image_url}
                    thumbHash={shot.thumb_hash ?? null}
                    alt=""
                  />
                ) : null}
              </div>
            );
          })
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
