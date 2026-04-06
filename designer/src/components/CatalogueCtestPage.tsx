// Design reference: github.com/dominikmartn/nothing-design-skill
// Accent override: Indigo (#6366f1) replaces Nothing Red
import { useMemo, useRef, useState } from 'react';
import { CatalogueHeader } from './CatalogueHeader';

type CdSection = 'catalogue' | 'videos';
type CdView = 'grid' | 'list';

interface CdScreen {
  id: string;
  name: string;
  group: string;
  flow: string;
  sequence: number;
  platform: 'WEB' | 'IOS' | 'ANDROID';
  theme: 'LIGHT' | 'DARK';
  preset: string;
  updatedAt: string;
}

interface CdVideo {
  id: string;
  title: string;
  source: string;
  duration: string;
}

const MOCK_SCREENS: CdScreen[] = [
  { id: 's-01', name: 'Select Coin', group: 'CRPKO', flow: 'DEPOSIT', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-02', name: 'Enter Amount', group: 'CRPKO', flow: 'DEPOSIT', sequence: 2, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-03', name: 'Review Details', group: 'CRPKO', flow: 'DEPOSIT', sequence: 3, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-04', name: 'Confirm OTP', group: 'CRPKO', flow: 'DEPOSIT', sequence: 4, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-05', name: 'Success', group: 'CRPKO', flow: 'DEPOSIT', sequence: 5, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-06', name: 'Select Coin', group: 'CRPKO', flow: 'WITHDRAW', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-07', name: 'Enter Address', group: 'CRPKO', flow: 'WITHDRAW', sequence: 2, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-08', name: 'Confirm', group: 'CRPKO', flow: 'WITHDRAW', sequence: 3, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 05' },
  { id: 's-09', name: 'Login', group: 'CRPKO', flow: 'AUTH', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 's-10', name: 'Register', group: 'CRPKO', flow: 'AUTH', sequence: 2, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 's-11', name: 'Dashboard', group: 'CRPKO', flow: 'HOME', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-01', name: 'Select Coin', group: 'BINANCE', flow: 'DEPOSIT', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-02', name: 'Network Select', group: 'BINANCE', flow: 'DEPOSIT', sequence: 2, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-03', name: 'Address', group: 'BINANCE', flow: 'DEPOSIT', sequence: 3, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-04', name: 'Success', group: 'BINANCE', flow: 'DEPOSIT', sequence: 4, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-05', name: 'Select Coin', group: 'BINANCE', flow: 'WITHDRAW', sequence: 1, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-06', name: 'Enter Address', group: 'BINANCE', flow: 'WITHDRAW', sequence: 2, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-07', name: 'Review', group: 'BINANCE', flow: 'WITHDRAW', sequence: 3, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-08', name: 'OTP', group: 'BINANCE', flow: 'WITHDRAW', sequence: 4, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'b-09', name: 'Success', group: 'BINANCE', flow: 'WITHDRAW', sequence: 5, platform: 'WEB', theme: 'DARK', preset: '1512', updatedAt: 'APR 04' },
  { id: 'c-01', name: 'Select Coin', group: 'COINBASE', flow: 'DEPOSIT', sequence: 1, platform: 'WEB', theme: 'LIGHT', preset: '1512', updatedAt: 'APR 03' },
  { id: 'c-02', name: 'Confirm Address', group: 'COINBASE', flow: 'DEPOSIT', sequence: 2, platform: 'WEB', theme: 'LIGHT', preset: '1512', updatedAt: 'APR 03' },
  { id: 'c-03', name: 'Success', group: 'COINBASE', flow: 'DEPOSIT', sequence: 3, platform: 'WEB', theme: 'LIGHT', preset: '1512', updatedAt: 'APR 03' },
];

const MOCK_VIDEOS: CdVideo[] = [
  { id: 'v-01', title: 'Deposit Flow Walkthrough', source: 'Loom', duration: '2:14' },
  { id: 'v-02', title: 'Withdraw UX Review', source: 'Loom', duration: '3:42' },
  { id: 'v-03', title: 'Competitor Teardown: Binance', source: 'YouTube', duration: '8:10' },
];

const PRIMARY_GROUP = 'CRPKO';
const VS_GROUPS = ['BINANCE', 'COINBASE'];
const ALL_GROUPS = ['CRPKO', 'BINANCE', 'COINBASE'];

function buildFlowGroups(screens: CdScreen[], flow: string) {
  const groups: Record<string, CdScreen[]> = {};
  for (const screen of screens) {
    if (screen.flow !== flow) continue;
    (groups[screen.group] ||= []).push(screen);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.sequence - b.sequence);
  }
  return groups;
}

function getFlowDiff(primary: CdScreen[], vs: CdScreen[]) {
  const primaryNames = new Set(primary.map((s) => s.name.toLowerCase()));
  const vsNames = new Set(vs.map((s) => s.name.toLowerCase()));
  const missing = primary.filter((s) => !vsNames.has(s.name.toLowerCase()));
  const extra = vs.filter((s) => !primaryNames.has(s.name.toLowerCase()));
  const diff = vs.length - primary.length;
  return { missing, extra, diff };
}

export function CatalogueCtestPage() {
  const [section, setSection] = useState<CdSection>('catalogue');
  const [view, setView] = useState<CdView>('grid');
  const [compareOn, setCompareOn] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState('DEPOSIT');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const allFlows = useMemo(() => [...new Set(MOCK_SCREENS.map((s) => s.flow))].sort(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return MOCK_SCREENS;
    return MOCK_SCREENS.filter((s) =>
      s.name.toUpperCase().includes(q) || s.group.includes(q) || s.flow.includes(q),
    );
  }, [query]);

  const flowGroups = useMemo(
    () => buildFlowGroups(filtered, selectedFlow),
    [filtered, selectedFlow],
  );

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
  }

  return (
    <div className="catalogue-page catalogue-page--ctest cd-page">
      <div className="cd-page__grid" aria-hidden="true" />

      <CatalogueHeader
        activeSection={section}
        canViewTeam={false}
        onBack={() => { window.location.href = '/designer/catalogue'; }}
        onOpenSettings={() => {}}
        onSectionChange={(s) => setSection(s as CdSection)}
      />

      <main className="cd-main">
        {section === 'catalogue' ? (
          <div className="cd-body">
            <div className="cd-toolbar">
              <div className="cd-toolbar__left">
                <button type="button" className="cd-pill" title="Filter">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                    <circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" />
                  </svg>
                </button>
                <button type="button" className="cd-pill" title="Sort">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="cd-view-toggle" role="tablist">
                  <button type="button" className={`cd-view-toggle__btn ${view === 'grid' && !compareOn ? 'is-active' : ''}`} onClick={() => { setView('grid'); setCompareOn(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                  </button>
                  <button type="button" className={`cd-view-toggle__btn ${view === 'list' && !compareOn ? 'is-active' : ''}`} onClick={() => { setView('list'); setCompareOn(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                  </button>
                </div>
              </div>
              <div className="cd-toolbar__right">
                <button type="button" className={`cd-pill cd-pill--compare ${compareOn ? 'is-active' : ''}`} onClick={() => setCompareOn((v) => !v)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5" /><line x1="21" y1="3" x2="14" y2="10" /><path d="M8 21H3v-5" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                  <span>CMP</span>
                </button>
                <button type="button" className={`cd-pill ${searchOpen ? 'is-active' : ''}`} onClick={searchOpen ? closeSearch : openSearch} title="Search">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  {query && !searchOpen && <span className="cd-pill__dot" />}
                </button>
                <button type="button" className="cd-pill cd-pill--accent" title="Upload">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
            </div>

            {searchOpen && (
              <div className="cd-search-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input ref={searchRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SEARCH SCREENS..." />
                <button type="button" className="cd-search-row__cancel" onClick={closeSearch}>CANCEL</button>
              </div>
            )}

            {compareOn && (
              <div className="cd-compare-bar">
                <span className="cd-label">COMPARE FLOW</span>
                <div className="cd-compare-bar__flows">
                  {allFlows.map((flow) => (
                    <button key={flow} type="button" className={`cd-chip ${selectedFlow === flow ? 'is-active' : ''}`} onClick={() => setSelectedFlow(flow)}>{flow}</button>
                  ))}
                </div>
              </div>
            )}

            {compareOn ? (
              <div className="cd-compare">
                {[PRIMARY_GROUP, ...VS_GROUPS].map((group) => {
                  const steps = flowGroups[group] || [];
                  const primarySteps = flowGroups[PRIMARY_GROUP] || [];
                  const isPrimary = group === PRIMARY_GROUP;
                  const { missing, extra, diff } = isPrimary ? { missing: [], extra: [], diff: 0 } : getFlowDiff(primarySteps, steps);

                  return (
                    <section key={group} className={`cd-flow-strip ${isPrimary ? 'cd-flow-strip--primary' : ''}`}>
                      <div className="cd-flow-strip__head">
                        <div className="cd-flow-strip__info">
                          <span className="cd-label">{group}{isPrimary && ' ●'}</span>
                          <span className="cd-flow-strip__meta">{steps.length} STEPS{!isPrimary && diff !== 0 && ` · ${diff > 0 ? '+' : ''}${diff} VS PRIMARY`}</span>
                        </div>
                      </div>
                      <div className="cd-flow-strip__steps">
                        {steps.length === 0 ? (
                          <span className="cd-flow-strip__empty">NO SCREENS FOR THIS FLOW</span>
                        ) : steps.map((step, i) => (
                          <div key={step.id} className="cd-step">
                            {i > 0 && <span className="cd-step__arrow">→</span>}
                            <div className="cd-step__card">
                              <div className="cd-step__preview">
                                <div className="cd-step__noise" />
                                <span className="cd-step__seq">{step.sequence}</span>
                              </div>
                              <span className="cd-step__name">{step.name.toUpperCase()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {!isPrimary && (missing.length > 0 || extra.length > 0) && (
                        <div className="cd-flow-strip__insights">
                          {missing.map((s) => <span key={s.id} className="cd-insight cd-insight--missing">⚠ MISSING: {s.name.toUpperCase()}</span>)}
                          {extra.map((s) => <span key={s.id} className="cd-insight cd-insight--extra">★ EXTRA: {s.name.toUpperCase()}</span>)}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : view === 'grid' ? (
              <div className="cd-grid">
                {ALL_GROUPS.map((group) => {
                  const groupScreens = filtered.filter((s) => s.group === group);
                  if (groupScreens.length === 0) return null;
                  return (
                    <section key={group} className="cd-group-section">
                      <h3 className="cd-group-title">
                        <span>{group}{group === PRIMARY_GROUP && ' ●'}</span>
                        <span className="cd-group-count">{groupScreens.length}</span>
                      </h3>
                      <div className="cd-cards">
                        {groupScreens.map((screen) => (
                          <article key={screen.id} className="cd-card">
                            <div className="cd-card__preview">
                              <div className="cd-card__noise" />
                              <div className="cd-card__wire" />
                              <div className="cd-card__wire" />
                              <div className="cd-card__wire" />
                            </div>
                            <div className="cd-card__body">
                              <div className="cd-card__top">
                                <span className="cd-label">{screen.flow}</span>
                                <span className="cd-label">{screen.platform}</span>
                              </div>
                              <h2>{screen.name.toUpperCase()}</h2>
                              <div className="cd-card__meta">
                                <span>{screen.theme}</span><span>{screen.preset}</span><span>SEQ {screen.sequence}</span>
                              </div>
                              <div className="cd-card__foot">
                                <span className="cd-label">UPDATED {screen.updatedAt}</span>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="cd-list">
                <header className="cd-list__row cd-list__row--head">
                  <span>SCREEN</span><span>GROUP</span><span>FLOW</span><span>PLATFORM</span><span>SEQ</span><span>UPDATED</span>
                </header>
                {filtered.map((screen) => (
                  <div key={screen.id} className="cd-list__row">
                    <span>{screen.name.toUpperCase()}</span><span>{screen.group}</span><span>{screen.flow}</span>
                    <span>{screen.platform}</span><span>{screen.sequence}</span><span>{screen.updatedAt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="cd-body cd-videos">
            <h2 className="cd-videos__title">REFERENCE VIDEOS</h2>
            <p className="cd-videos__desc">Design inspiration and competitive UX study.</p>
            <div className="cd-videos__grid">
              {MOCK_VIDEOS.map((video) => (
                <article key={video.id} className="cd-video-card">
                  <div className="cd-video-card__preview">
                    <div className="cd-card__noise" />
                    <span className="cd-video-card__play">▶</span>
                  </div>
                  <div className="cd-video-card__body">
                    <h3>{video.title.toUpperCase()}</h3>
                    <div className="cd-card__meta"><span>{video.source.toUpperCase()}</span><span>{video.duration}</span></div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
