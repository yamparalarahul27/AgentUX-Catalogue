import { useEffect, useState } from 'react';

import {
  loadWhatsNewReleases,
  type WhatsNewBullet,
  type WhatsNewBulletKind,
  type WhatsNewRelease,
} from '../data/whats-new';
import { markAllWhatsNewSeen } from './WhatsNewPanel';

// Full historical browse for every release the team has shipped.
// Reads the same source as the (now-parked) WhatsNew sheet so authoring
// stays in one place: prepend an entry to whats-new.json per PR.
//
// Reached via the history icon in the catalogue header (opens in a new
// tab). Mount also marks every release as seen so the header dot clears.
export function ChangelogPage() {
  const [releases, setReleases] = useState<WhatsNewRelease[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadWhatsNewReleases().then((data) => {
      if (cancelled) return;
      setReleases(data);
      setLoading(false);
      markAllWhatsNewSeen(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="changelog-page">
      <header className="changelog-page__header">
        <h1 className="changelog-page__title">Changelog</h1>
        <p className="changelog-page__lede">Everything we've shipped, most recent first.</p>
      </header>

      {loading ? (
        <p className="changelog-page__empty">Loading…</p>
      ) : releases.length === 0 ? (
        <p className="changelog-page__empty">No releases yet.</p>
      ) : (
        <div className="changelog-page__entries">
          {releases.map((release) => (
            <ChangelogEntry key={release.id} release={release} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangelogEntry({ release }: { release: WhatsNewRelease }) {
  return (
    <article className="changelog-page__entry">
      <div className="changelog-page__date">{release.date}</div>
      <div className="changelog-page__body">
        <h2 className="changelog-page__entry-title">{release.title}</h2>
        <ul className="changelog-page__bullets">
          {release.bullets.map((bullet, index) => (
            <BulletRow key={index} bullet={bullet} />
          ))}
        </ul>
        {release.imageUrl && (
          <figure className="changelog-page__figure">
            <img src={release.imageUrl} alt="" loading="lazy" />
          </figure>
        )}
      </div>
    </article>
  );
}

function BulletRow({ bullet }: { bullet: WhatsNewBullet }) {
  return (
    <li className="changelog-page__bullet">
      <KindBadge kind={bullet.kind} />
      <span>{bullet.text}</span>
    </li>
  );
}

function KindBadge({ kind }: { kind: WhatsNewBulletKind }) {
  return (
    <span className={`changelog-page__kind changelog-page__kind--${kind}`}>{kind}</span>
  );
}
