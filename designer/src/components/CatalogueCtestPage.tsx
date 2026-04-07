import { useState } from 'react';
import { CatalogueHeader } from './CatalogueHeader';

type GroupStatus = 'primary' | 'active' | 'review' | 'archived';

interface FolderGroup {
  id: string;
  name: string;
  icon: string | null;
  description: string;
  status: GroupStatus;
  screenCount: number;
  thumbnails: string[];
}

const STATUS_CONFIG: Record<GroupStatus, { label: string; symbol: string; className: string }> = {
  primary: { label: 'PRIMARY', symbol: '★', className: 'cd-folder-status--primary' },
  active: { label: 'ACTIVE', symbol: '●', className: 'cd-folder-status--active' },
  review: { label: 'REVIEW', symbol: '◐', className: 'cd-folder-status--review' },
  archived: { label: 'ARCHIVED', symbol: '○', className: 'cd-folder-status--archived' },
};

const MOCK_GROUPS: FolderGroup[] = [
  {
    id: 'g-01',
    name: 'BINANCE',
    icon: null,
    description: 'Main competitor',
    status: 'active',
    screenCount: 12,
    thumbnails: [],
  },
  {
    id: 'g-02',
    name: 'COINBASE',
    icon: null,
    description: 'US market ref',
    status: 'archived',
    screenCount: 8,
    thumbnails: [],
  },
  {
    id: 'g-03',
    name: 'CRPKO',
    icon: null,
    description: 'Our product',
    status: 'primary',
    screenCount: 15,
    thumbnails: [],
  },
];

function getLetterAvatar(name: string) {
  return name.charAt(0).toUpperCase();
}

function FolderCard({ group }: { group: FolderGroup }) {
  const status = STATUS_CONFIG[group.status];

  return (
    <article className="cd-folder-card">
      <div className="cd-folder-card__header">
        <div className="cd-folder-card__icon">
          {group.icon ? (
            <img src={group.icon} alt={group.name} />
          ) : (
            <span className="cd-folder-card__letter">{getLetterAvatar(group.name)}</span>
          )}
        </div>
        <div className="cd-folder-card__info">
          <div className="cd-folder-card__title-row">
            <h3 className="cd-folder-card__name">{group.name}</h3>
            <span className={`cd-folder-status ${status.className}`}>
              {status.symbol} {status.label}
            </span>
          </div>
          <p className="cd-folder-card__desc">{group.description}</p>
          <span className="cd-folder-card__count">{group.screenCount} screens</span>
        </div>
      </div>

      <div className="cd-folder-card__thumbs">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cd-folder-card__thumb">
            {group.thumbnails[i] ? (
              <img src={group.thumbnails[i]} alt="" draggable={false} />
            ) : (
              <div className="cd-folder-card__thumb-placeholder">
                <div className="cd-folder-card__thumb-noise" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="cd-folder-card__footer">
        <span className="cd-folder-card__arrow">→</span>
      </div>
    </article>
  );
}

export function CatalogueCtestPage() {
  const [section, setSection] = useState<'catalogue' | 'videos'>('catalogue');

  return (
    <div className="catalogue-page catalogue-page--ctest cd-page">
      <div className="cd-page__grid" aria-hidden="true" />

      <CatalogueHeader
        activeSection={section}
        canViewTeam={false}
        onBack={() => { window.location.href = '/designer/catalogue'; }}
        onOpenSettings={() => {}}
        onSectionChange={(s) => setSection(s as 'catalogue' | 'videos')}
      />

      <main className="cd-main">
        <div className="cd-body">
          <div className="cd-folder-summary">
            <span className="cd-label">{MOCK_GROUPS.length} GROUPS · {MOCK_GROUPS.reduce((sum, g) => sum + g.screenCount, 0)} SCREENS</span>
          </div>

          <div className="cd-folder-grid">
            {MOCK_GROUPS.map((group) => (
              <FolderCard key={group.id} group={group} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
