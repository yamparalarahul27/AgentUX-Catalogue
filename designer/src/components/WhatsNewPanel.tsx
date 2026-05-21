import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Star, X } from 'lucide-react';

import { WHATS_NEW_RELEASES, type WhatsNewBullet, type WhatsNewRelease } from '../data/whats-new';

// localStorage key for the most-recently-seen release id. Used to
// compute the unseen-count badge on the header trigger and decide
// whether to auto-open the panel on first load after an update.
export const WHATS_NEW_LAST_SEEN_KEY = 'agentux:whats-new-last-seen';

interface WhatsNewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsNewPanel({ isOpen, onClose }: WhatsNewPanelProps) {
  const releases = WHATS_NEW_RELEASES;
  // Track which collapsed releases the user has expanded inline.
  // Latest release is always expanded; everything else starts
  // collapsed and the user can flip them open one at a time.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Reset expanded state each time the panel re-opens, so a long
  // browsing session doesn't accumulate every release expanded.
  useEffect(() => {
    if (isOpen) setExpandedIds(new Set());
  }, [isOpen]);

  // Esc to close — only when the panel is mounted.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Mark the latest release as seen when the user dismisses with
  // "Got it" or the close button. Stamps the most-recent release id
  // so the next-load comparison shows zero unseen.
  function dismissAndMarkSeen() {
    if (releases.length > 0) {
      try {
        window.localStorage.setItem(WHATS_NEW_LAST_SEEN_KEY, releases[0].id);
      } catch {
        // Ignore quota / disabled storage — the badge will still
        // hide next load when comparison fails open.
      }
    }
    onClose();
  }

  const unseenCount = useMemo(() => countUnseen(releases), [releases]);

  if (!isOpen) return null;

  return (
    <>
      <div className="whats-new-overlay" onClick={dismissAndMarkSeen} />
      <aside className="whats-new-panel" role="dialog" aria-label="What's new">
        <header className="whats-new-panel__header">
          <Star size={18} className="whats-new-panel__header-icon" aria-hidden="true" />
          <h3 className="whats-new-panel__title">What's new</h3>
          {unseenCount > 0 && (
            <span className="whats-new-panel__count">{unseenCount} new</span>
          )}
          <button
            type="button"
            className="whats-new-panel__close"
            onClick={dismissAndMarkSeen}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="whats-new-panel__body">
          {releases.map((release, index) => {
            // First release is always shown expanded; rest start
            // collapsed but flip open on click.
            const isExpanded = index === 0 || expandedIds.has(release.id);
            return (
              <ReleaseCard
                key={release.id}
                release={release}
                isExpanded={isExpanded}
                isLatest={index === 0}
                onToggle={() => {
                  if (index === 0) return; // latest always expanded
                  setExpandedIds((current) => {
                    const next = new Set(current);
                    if (next.has(release.id)) next.delete(release.id);
                    else next.add(release.id);
                    return next;
                  });
                }}
              />
            );
          })}
        </div>

        <footer className="whats-new-panel__footer">
          <button type="button" className="whats-new-panel__dismiss" onClick={dismissAndMarkSeen}>
            Got it
          </button>
        </footer>
      </aside>
    </>
  );
}

interface ReleaseCardProps {
  release: WhatsNewRelease;
  isExpanded: boolean;
  isLatest: boolean;
  onToggle: () => void;
}

function ReleaseCard({ release, isExpanded, isLatest, onToggle }: ReleaseCardProps) {
  // The head row (date + title + chevron) is the only toggle target.
  // The body (image + bullets) is regular content — clicking it
  // won't accidentally collapse the card while you're reading.
  // Latest release is locked open: no chevron, head not clickable.
  const headClickable = !isLatest;
  return (
    <article className={`whats-new-release ${isExpanded ? '' : 'whats-new-release--collapsed'}`}>
      <div
        className={`whats-new-release__head ${headClickable ? 'is-toggle' : ''}`}
        role={headClickable ? 'button' : undefined}
        tabIndex={headClickable ? 0 : undefined}
        aria-expanded={headClickable ? isExpanded : undefined}
        onClick={headClickable ? onToggle : undefined}
        onKeyDown={(event) => {
          if (!headClickable) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="whats-new-release__head-text">
          <div className="whats-new-release__meta">
            <span className="whats-new-release__date">{release.date}</span>
            {isLatest && <span className="whats-new-release__new-dot" aria-label="New release" />}
          </div>
          <h4 className="whats-new-release__title">{release.title}</h4>
        </div>
        {headClickable && (
          <span className="whats-new-release__chevron" aria-hidden="true">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="whats-new-release__body">
          {release.imageUrl && (
            <div
              className="whats-new-release__image"
              style={{ backgroundImage: `url("${release.imageUrl}")` }}
              aria-hidden="true"
            />
          )}
          <ul className="whats-new-release__list">
            {release.bullets.map((bullet, idx) => (
              <li key={idx} className={`whats-new-release__item whats-new-release__item--${bullet.kind}`}>
                <span className={`whats-new-kind whats-new-kind--${bullet.kind}`}>
                  {KIND_LABEL[bullet.kind]}
                </span>
                <span className="whats-new-release__item-text">{bullet.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

const KIND_LABEL: Record<WhatsNewBullet['kind'], string> = {
  new: 'New',
  improved: 'Improved',
  fix: 'Fix',
};

// Count releases newer than the last-seen id. Newer = appears
// earlier in the array (newest-first ordering).
function countUnseen(releases: WhatsNewRelease[]): number {
  if (typeof window === 'undefined') return 0;
  let lastSeen: string | null = null;
  try {
    lastSeen = window.localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY);
  } catch {
    return 0;
  }
  if (!lastSeen) return releases.length;
  const idx = releases.findIndex((release) => release.id === lastSeen);
  if (idx < 0) return releases.length; // unknown id — treat all as new
  return idx;
}

// Re-exported for the header trigger so it can render the badge
// without duplicating the comparison logic.
export function getWhatsNewUnseenCount(): number {
  return countUnseen(WHATS_NEW_RELEASES);
}
