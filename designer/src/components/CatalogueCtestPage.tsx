import { useRef, useState } from 'react';
import { CatalogueHeader } from './CatalogueHeader';

type GroupStatus = 'primary' | 'active' | 'review' | 'archived';

interface FolderScreen {
  id: string;
  label: string;
  color: string;
}

interface FolderGroup {
  id: string;
  name: string;
  icon: string | null;
  description: string;
  status: GroupStatus;
  screenCount: number;
  screens: FolderScreen[];
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
    screens: [
      { id: 'b-1', label: 'Deposit Flow', color: '#1e3a5f' },
      { id: 'b-2', label: 'Trade View', color: '#2d1b4e' },
      { id: 'b-3', label: 'Portfolio', color: '#1a3d2e' },
    ],
  },
  {
    id: 'g-02',
    name: 'COINBASE',
    icon: null,
    description: 'US market ref',
    status: 'archived',
    screenCount: 8,
    screens: [
      { id: 'c-1', label: 'Home Feed', color: '#1b2d4e' },
      { id: 'c-2', label: 'Buy Flow', color: '#3d1a2e' },
      { id: 'c-3', label: 'Wallet', color: '#2e3a1a' },
    ],
  },
  {
    id: 'g-03',
    name: 'CRPKO',
    icon: null,
    description: 'Our product',
    status: 'primary',
    screenCount: 15,
    screens: [
      { id: 'k-1', label: 'Dashboard', color: '#2a1a4e' },
      { id: 'k-2', label: 'Send Crypto', color: '#1a3a4e' },
      { id: 'k-3', label: 'Settings', color: '#3a2a1a' },
    ],
  },
];

function getLetterAvatar(name: string) {
  return name.charAt(0).toUpperCase();
}

function FolderCarousel({ screens }: { screens: FolderScreen[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    const slideWidth = track.scrollWidth / screens.length;
    const idx = Math.round(track.scrollLeft / slideWidth);
    setActiveIndex(Math.min(idx, screens.length - 1));
  }

  function scrollTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const slideWidth = track.scrollWidth / screens.length;
    track.scrollTo({ left: slideWidth * index, behavior: 'smooth' });
  }

  return (
    <div className="cd-carousel">
      <div className="cd-carousel__track" ref={trackRef} onScroll={handleScroll}>
        {screens.map((screen, i) => (
          <div
            key={screen.id}
            className={`cd-carousel__slide ${i === activeIndex ? 'is-active' : ''}`}
          >
            <div className="cd-carousel__screen" style={{ background: screen.color }}>
              <div className="cd-carousel__screen-wire" />
              <div className="cd-carousel__screen-wire" />
              <div className="cd-carousel__screen-wire" />
              <span className="cd-carousel__screen-label">{screen.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="cd-carousel__footer">
        <div className="cd-carousel__dots">
          {screens.map((screen, i) => (
            <button
              key={screen.id}
              type="button"
              className={`cd-carousel__dot ${i === activeIndex ? 'is-active' : ''}`}
              onClick={() => scrollTo(i)}
            />
          ))}
        </div>
        <span className="cd-carousel__count">{activeIndex + 1}/{screens.length}</span>
      </div>
    </div>
  );
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

      <FolderCarousel screens={group.screens} />

      <div className="cd-folder-card__footer">
        <span className="cd-folder-card__arrow">→</span>
      </div>
    </article>
  );
}

export function CatalogueCtestPage() {
  const [section, setSection] = useState<'catalogue' | 'videos'>('catalogue');

  return (
    <div className="catalogue-page catalogue-page--ctest">
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
