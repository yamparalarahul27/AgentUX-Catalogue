import { useMemo, useState } from 'react';

type GroupPlatform = 'web' | 'mobile';
type MainFeature = 'spot' | 'perpetuals' | 'options' | 'derivatives' | 'swap' | 'staking';
type PresetFilter = 'all' | 'web-1512' | 'web-1440' | 'mobile-ios' | 'mobile-android';
type SortFilter = 'latest-all' | 'latest-group' | 'oldest' | 'name-asc';

interface GroupFlow {
  id: string;
  name: string;
  steps: string[];
}

interface GroupScreen {
  id: string;
  title: string;
  flowId: string;
  tone: string;
  updatedAt: string;
}

interface GroupModel {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  dau: string;
  features: MainFeature[];
  platforms: GroupPlatform[];
  updatedAt: string;
  flows: GroupFlow[];
  screens: GroupScreen[];
}

const FEATURE_OPTIONS: Array<{ value: MainFeature; label: string; comingSoon?: boolean }> = [
  { value: 'spot', label: 'Spot' },
  { value: 'perpetuals', label: 'Perpetuals' },
  { value: 'options', label: 'Options', comingSoon: true },
  { value: 'derivatives', label: 'Derivatives', comingSoon: true },
  { value: 'swap', label: 'Swap', comingSoon: true },
  { value: 'staking', label: 'Staking', comingSoon: true },
];

const PRESET_OPTIONS: Array<{ value: PresetFilter; label: string }> = [
  { value: 'all', label: 'All presets' },
  { value: 'web-1512', label: 'Web 1512' },
  { value: 'web-1440', label: 'Web 1440' },
  { value: 'mobile-ios', label: 'Mobile iOS' },
  { value: 'mobile-android', label: 'Mobile Android' },
];

const SORT_OPTIONS: Array<{ value: SortFilter; label: string }> = [
  { value: 'latest-all', label: 'Latest (All)' },
  { value: 'latest-group', label: 'Latest (This Group)' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name-asc', label: 'Name A-Z' },
];

const GROUPS: GroupModel[] = [
  {
    id: 'binance',
    name: 'Binance',
    description: 'Main global competitor',
    iconUrl: null,
    dau: '8.4M/day',
    features: ['spot', 'perpetuals'],
    platforms: ['web', 'mobile'],
    updatedAt: '2026-04-07T10:25:00.000Z',
    flows: [
      {
        id: 'onboarding',
        name: 'Onboarding',
        steps: ['Setting up account', 'Connecting Google Mail', 'Completing KYC'],
      },
      {
        id: 'home',
        name: 'Home',
        steps: ['Starting an onboarding', 'Editing company profile', 'Switching layouts'],
      },
      {
        id: 'assistant',
        name: 'Assistant',
        steps: ['Chatting with AI', 'Recording an answer'],
      },
    ],
    screens: [
      { id: 'bn-01', title: 'Signup Entry', flowId: 'onboarding', tone: '#1d3555', updatedAt: '2026-04-07T10:20:00.000Z' },
      { id: 'bn-02', title: 'Email Verification', flowId: 'onboarding', tone: '#2c1f52', updatedAt: '2026-04-07T10:19:00.000Z' },
      { id: 'bn-03', title: 'KYC Checklist', flowId: 'onboarding', tone: '#2a3d1f', updatedAt: '2026-04-07T10:17:00.000Z' },
      { id: 'bn-04', title: 'Home Dashboard', flowId: 'home', tone: '#2b2b30', updatedAt: '2026-04-07T10:15:00.000Z' },
      { id: 'bn-05', title: 'Layout Switcher', flowId: 'home', tone: '#3d2920', updatedAt: '2026-04-07T10:14:00.000Z' },
      { id: 'bn-06', title: 'Assistant Prompt', flowId: 'assistant', tone: '#1f3d3d', updatedAt: '2026-04-07T10:13:00.000Z' },
    ],
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    description: 'US market reference',
    iconUrl: null,
    dau: '3.2M/day',
    features: ['spot'],
    platforms: ['web', 'mobile'],
    updatedAt: '2026-04-06T14:25:00.000Z',
    flows: [
      {
        id: 'onboarding',
        name: 'Onboarding',
        steps: ['Account basics', 'Verification', 'Funding setup'],
      },
      {
        id: 'trade',
        name: 'Trade',
        steps: ['Asset picker', 'Order details', 'Review and submit'],
      },
    ],
    screens: [
      { id: 'cb-01', title: 'Account Basics', flowId: 'onboarding', tone: '#1e334d', updatedAt: '2026-04-06T14:20:00.000Z' },
      { id: 'cb-02', title: 'Verification Prompt', flowId: 'onboarding', tone: '#34214d', updatedAt: '2026-04-06T14:18:00.000Z' },
      { id: 'cb-03', title: 'Funding Setup', flowId: 'onboarding', tone: '#2d3a21', updatedAt: '2026-04-06T14:17:00.000Z' },
      { id: 'cb-04', title: 'Asset Picker', flowId: 'trade', tone: '#1f2a35', updatedAt: '2026-04-06T14:16:00.000Z' },
      { id: 'cb-05', title: 'Order Review', flowId: 'trade', tone: '#3b2521', updatedAt: '2026-04-06T14:13:00.000Z' },
    ],
  },
  {
    id: 'crpko',
    name: 'Crpko',
    description: 'Our product',
    iconUrl: null,
    dau: '420K/day',
    features: ['spot', 'perpetuals'],
    platforms: ['web', 'mobile'],
    updatedAt: '2026-04-07T11:55:00.000Z',
    flows: [
      {
        id: 'deposit',
        name: 'Deposit',
        steps: ['Select coin', 'Enter amount', 'Review details', 'Confirm and done'],
      },
      {
        id: 'withdraw',
        name: 'Withdraw',
        steps: ['Select coin', 'Address', 'Review', 'OTP', 'Success'],
      },
      {
        id: 'home',
        name: 'Home',
        steps: ['Dashboard', 'Widgets', 'Activity feed'],
      },
    ],
    screens: [
      { id: 'ck-01', title: 'Deposit - Select Coin', flowId: 'deposit', tone: '#243248', updatedAt: '2026-04-07T11:52:00.000Z' },
      { id: 'ck-02', title: 'Deposit - Amount', flowId: 'deposit', tone: '#27362d', updatedAt: '2026-04-07T11:49:00.000Z' },
      { id: 'ck-03', title: 'Deposit - Review', flowId: 'deposit', tone: '#3b2a2f', updatedAt: '2026-04-07T11:47:00.000Z' },
      { id: 'ck-04', title: 'Withdraw - Address', flowId: 'withdraw', tone: '#1e3b44', updatedAt: '2026-04-07T11:45:00.000Z' },
      { id: 'ck-05', title: 'Withdraw - OTP', flowId: 'withdraw', tone: '#3f3322', updatedAt: '2026-04-07T11:42:00.000Z' },
      { id: 'ck-06', title: 'Home Dashboard', flowId: 'home', tone: '#2b2e37', updatedAt: '2026-04-07T11:40:00.000Z' },
    ],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    description: 'Perpetuals heavy flow benchmark',
    iconUrl: null,
    dau: '2.7M/day',
    features: ['spot', 'perpetuals'],
    platforms: ['web', 'mobile'],
    updatedAt: '2026-04-04T09:42:00.000Z',
    flows: [
      {
        id: 'perp-entry',
        name: 'Perpetual Entry',
        steps: ['Select pair', 'Set leverage', 'Place order'],
      },
      {
        id: 'wallet',
        name: 'Wallet',
        steps: ['Asset summary', 'Transfer', 'History'],
      },
    ],
    screens: [
      { id: 'bb-01', title: 'Pair Selection', flowId: 'perp-entry', tone: '#213449', updatedAt: '2026-04-04T09:38:00.000Z' },
      { id: 'bb-02', title: 'Leverage Slider', flowId: 'perp-entry', tone: '#32254a', updatedAt: '2026-04-04T09:35:00.000Z' },
      { id: 'bb-03', title: 'Order Confirmation', flowId: 'perp-entry', tone: '#3d2f1e', updatedAt: '2026-04-04T09:31:00.000Z' },
      { id: 'bb-04', title: 'Wallet Overview', flowId: 'wallet', tone: '#233a32', updatedAt: '2026-04-04T09:29:00.000Z' },
    ],
  },
];

function getInitialLetter(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function buildCdHref(path: '/cd' | '/cdg', groupId?: string): string {
  const isDesignerPath = window.location.pathname.startsWith('/designer/');
  const base = isDesignerPath ? '/designer' : '';
  const href = `${base}${path}`;
  if (!groupId) return href;
  return `${href}?group=${encodeURIComponent(groupId)}`;
}

function isCdgRoute(pathname: string): boolean {
  return pathname.includes('/cdg');
}

function formatPlatforms(platforms: GroupPlatform[]): string {
  const labels = platforms.map((item) => item === 'web' ? 'Web' : 'Mobile');
  return labels.join(' + ');
}

function isPresetMatch(group: GroupModel, preset: PresetFilter): boolean {
  if (preset === 'all') return true;
  if (preset.startsWith('web')) return group.platforms.includes('web');
  if (preset.startsWith('mobile')) return group.platforms.includes('mobile');
  return true;
}

function compareGroupSort(left: GroupModel, right: GroupModel, sortBy: SortFilter): number {
  if (sortBy === 'name-asc') return left.name.localeCompare(right.name);
  if (sortBy === 'oldest') return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function CdHeader({
  searchValue,
  onSearchChange,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="cd-header">
      <div className="cd-header__brand">
        <span className="cd-header__logo">A</span>
        <strong>AgentUX</strong>
      </div>
      <label className="cd-header__search">
        <input
          type="text"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search screenshots..."
        />
      </label>
      <div className="cd-header__profile" title="Profile">
        R
      </div>
    </header>
  );
}

function CdSectionTabs() {
  return (
    <div className="cd-tabs">
      <button type="button" className="cd-tabs__tab is-active">Catalogue</button>
      <button type="button" className="cd-tabs__tab">Videos</button>
      <button type="button" className="cd-tabs__settings">Settings</button>
    </div>
  );
}

function CdFiltersAccordion({
  open,
  onOpenChange,
  selectedFeature,
  selectedPreset,
  selectedSort,
  onFeatureSelect,
  onPresetSelect,
  onSortSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFeature: MainFeature | null;
  selectedPreset: PresetFilter;
  selectedSort: SortFilter;
  onFeatureSelect: (feature: MainFeature) => void;
  onPresetSelect: (preset: PresetFilter) => void;
  onSortSelect: (sortBy: SortFilter) => void;
}) {
  return (
    <section className="cd-accordion">
      <button
        type="button"
        className="cd-accordion__trigger"
        onClick={() => onOpenChange(!open)}
      >
        <span>{open ? '▼' : '▶'} Main Features, Presets, and Quick Filters</span>
      </button>
      {open && (
        <div className="cd-accordion__body">
          <div className="cd-filter-row">
            <span className="cd-filter-row__label">Main Features</span>
            <div className="cd-filter-row__chips">
              {FEATURE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`cd-chip ${selectedFeature === option.value ? 'is-active' : ''} ${option.comingSoon ? 'is-disabled' : ''}`}
                  disabled={option.comingSoon}
                  onClick={() => onFeatureSelect(option.value)}
                >
                  {option.label}{option.comingSoon ? ' (Soon)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="cd-filter-row">
            <span className="cd-filter-row__label">Presets</span>
            <div className="cd-filter-row__chips">
              {PRESET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`cd-chip ${selectedPreset === option.value ? 'is-active' : ''}`}
                  onClick={() => onPresetSelect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cd-filter-row">
            <span className="cd-filter-row__label">Sort</span>
            <div className="cd-filter-row__chips">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`cd-chip ${selectedSort === option.value ? 'is-active' : ''}`}
                  onClick={() => onSortSelect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CdFolderCard({ group }: { group: GroupModel }) {
  const preview = group.screens.slice(0, 3);

  return (
    <article className="cd-folder-card">
      <div className="cd-folder-card__head">
        <div className="cd-folder-card__avatar">
          {group.iconUrl
            ? <img src={group.iconUrl} alt={group.name} />
            : <span>{getInitialLetter(group.name)}</span>}
        </div>
        <div className="cd-folder-card__meta">
          <h3>{group.name}</h3>
          <p>{group.description}</p>
        </div>
      </div>

      <div className="cd-folder-card__cover">
        {preview.map((screen) => (
          <div key={screen.id} className="cd-folder-card__tile" style={{ background: screen.tone }}>
            <span>{screen.title}</span>
          </div>
        ))}
      </div>

      <div className="cd-folder-card__foot">
        <a href={buildCdHref('/cdg', group.id)} className="cd-folder-card__open">Open →</a>
      </div>
    </article>
  );
}

function CdFolderHomePage() {
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MainFeature | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetFilter>('all');
  const [selectedSort, setSelectedSort] = useState<SortFilter>('latest-all');

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = GROUPS.filter((group) => {
      const matchesFeature = !selectedFeature || group.features.includes(selectedFeature);
      const matchesPreset = isPresetMatch(group, selectedPreset);
      const matchesQuery = !query
        || group.name.toLowerCase().includes(query)
        || group.description.toLowerCase().includes(query)
        || group.features.some((item) => item.includes(query));
      return matchesFeature && matchesPreset && matchesQuery;
    });

    return [...filtered].sort((left, right) => compareGroupSort(left, right, selectedSort));
  }, [search, selectedFeature, selectedPreset, selectedSort]);

  return (
    <div className="cd-shell">
      <CdHeader searchValue={search} onSearchChange={setSearch} />
      <CdSectionTabs />

      <main className="cd-main">
        <CdFiltersAccordion
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          selectedFeature={selectedFeature}
          selectedPreset={selectedPreset}
          selectedSort={selectedSort}
          onFeatureSelect={(feature) => {
            setSelectedFeature(feature);
            setFiltersOpen(false);
          }}
          onPresetSelect={(preset) => {
            setSelectedPreset(preset);
            setFiltersOpen(false);
          }}
          onSortSelect={(sortBy) => {
            setSelectedSort(sortBy);
            setFiltersOpen(false);
          }}
        />

        <section className="cd-folder-grid">
          {visibleGroups.map((group) => (
            <CdFolderCard key={group.id} group={group} />
          ))}
        </section>
      </main>
    </div>
  );
}

function CdFlowTree({
  group,
  flowSearch,
  onFlowSearchChange,
  activeFlowId,
  onActiveFlowChange,
}: {
  group: GroupModel;
  flowSearch: string;
  onFlowSearchChange: (value: string) => void;
  activeFlowId: string | null;
  onActiveFlowChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [expandedFlowIds, setExpandedFlowIds] = useState<Set<string>>(() => new Set(group.flows.map((flow) => flow.id)));
  const query = flowSearch.trim().toLowerCase();
  const visibleFlows = group.flows.filter((flow) => {
    if (!query) return true;
    return flow.name.toLowerCase().includes(query)
      || flow.steps.some((step) => step.toLowerCase().includes(query));
  });

  function toggleFlow(flowId: string) {
    setExpandedFlowIds((previous) => {
      const next = new Set(previous);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  }

  return (
    <section className="cdg-tree">
      <button type="button" className="cdg-tree__toggle" onClick={() => setOpen(!open)}>
        {open ? '▼' : '▶'} Flows
      </button>
      {open && (
        <div className="cdg-tree__body">
          <input
            type="text"
            value={flowSearch}
            onChange={(event) => onFlowSearchChange(event.target.value)}
            placeholder="Search flow..."
            className="cdg-tree__search"
          />

          <button
            type="button"
            className={`cdg-tree__all ${activeFlowId === null ? 'is-active' : ''}`}
            onClick={() => onActiveFlowChange(null)}
          >
            All flows
          </button>

          <div className="cdg-tree__list">
            {visibleFlows.map((flow) => (
              <div key={flow.id} className="cdg-tree__flow">
                <button
                  type="button"
                  className={`cdg-tree__flow-row ${activeFlowId === flow.id ? 'is-active' : ''}`}
                  onClick={() => onActiveFlowChange(flow.id)}
                >
                  <span>{flow.name}</span>
                  <span>{expandedFlowIds.has(flow.id) ? '▾' : '▸'}</span>
                </button>

                {expandedFlowIds.has(flow.id) && (
                  <div className="cdg-tree__steps">
                    {flow.steps.map((step) => (
                      <button key={`${flow.id}-${step}`} type="button" className="cdg-tree__step">
                        {step}
                      </button>
                    ))}
                    <button type="button" className="cdg-tree__expand-btn" onClick={() => toggleFlow(flow.id)}>
                      Collapse
                    </button>
                  </div>
                )}

                {!expandedFlowIds.has(flow.id) && (
                  <button type="button" className="cdg-tree__expand-btn" onClick={() => toggleFlow(flow.id)}>
                    Expand
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CdGroupDetailPage({ group }: { group: GroupModel }) {
  const [search, setSearch] = useState('');
  const [flowSearch, setFlowSearch] = useState('');
  const [activeFlowId, setActiveFlowId] = useState<string | null>(group.flows[0]?.id ?? null);

  const visibleScreens = useMemo(() => {
    const query = search.trim().toLowerCase();
    return group.screens
      .filter((screen) => !activeFlowId || screen.flowId === activeFlowId)
      .filter((screen) => !query || screen.title.toLowerCase().includes(query))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [activeFlowId, group.screens, search]);

  return (
    <div className="cd-shell">
      <CdHeader searchValue={search} onSearchChange={setSearch} />
      <CdSectionTabs />

      <main className="cd-main">
        <a className="cdg-back" href={buildCdHref('/cd')}>← All groups</a>

        <section className="cdg-hero">
          <div className="cdg-hero__icon">
            {group.iconUrl
              ? <img src={group.iconUrl} alt={group.name} />
              : <span>{getInitialLetter(group.name)}</span>}
          </div>
          <div className="cdg-hero__copy">
            <h2>{group.name}</h2>
            <p>{group.description}</p>
            <div className="cdg-hero__meta">
              <span>Platform: {formatPlatforms(group.platforms)}</span>
              <span>DAU: {group.dau}</span>
              <span>Features: {group.features.map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')}</span>
            </div>
          </div>
          <button type="button" className="cdg-hero__edit">Edit Group Info</button>
        </section>

        <div className="cdg-layout">
          <CdFlowTree
            group={group}
            flowSearch={flowSearch}
            onFlowSearchChange={setFlowSearch}
            activeFlowId={activeFlowId}
            onActiveFlowChange={setActiveFlowId}
          />

          <section className="cdg-screens">
            <div className="cdg-screens__head">
              <h3>Flow Screens</h3>
              <span>{visibleScreens.length} screens</span>
            </div>
            <div className="cdg-screens__grid">
              {visibleScreens.map((screen) => (
                <article key={screen.id} className="cdg-screen-card">
                  <div className="cdg-screen-card__preview" style={{ background: screen.tone }}>
                    <span>{screen.title}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export function CatalogueCtestPage() {
  const pathname = window.location.pathname.toLowerCase();
  const routeIsGroupDetail = isCdgRoute(pathname);
  const groupId = new URLSearchParams(window.location.search).get('group');
  const activeGroup = GROUPS.find((group) => group.id === groupId) || GROUPS[0];

  if (routeIsGroupDetail) {
    return <CdGroupDetailPage group={activeGroup} />;
  }

  return <CdFolderHomePage />;
}
