import { useMemo, useState } from 'react';
import { CatalogueHeader } from './CatalogueHeader';

type CtestStatus = 'neutral' | 'good' | 'warning' | 'critical';
type CtestView = 'grid' | 'list' | 'matrix';

interface CtestCard {
  id: string;
  title: string;
  group: string;
  flow: string;
  theme: 'LIGHT' | 'DARK';
  platform: 'WEB' | 'IOS' | 'ANDROID';
  preset: string;
  updatedAt: string;
  coverage: number;
  status: CtestStatus;
}

const CTEST_DATA: CtestCard[] = [
  {
    id: 'ct-001',
    title: 'DEPOSIT / REVIEW',
    group: 'BINANCE',
    flow: 'DEPOSIT',
    theme: 'DARK',
    platform: 'WEB',
    preset: '1512',
    updatedAt: 'APR 04 18:10',
    coverage: 0.92,
    status: 'good',
  },
  {
    id: 'ct-002',
    title: 'ADDRESS / PICKER',
    group: 'BYBIT',
    flow: 'WITHDRAW',
    theme: 'LIGHT',
    platform: 'IOS',
    preset: 'IOS',
    updatedAt: 'APR 04 17:48',
    coverage: 0.63,
    status: 'warning',
  },
  {
    id: 'ct-003',
    title: 'KYC / STEP 02',
    group: 'KRAKEN',
    flow: 'ONBOARD',
    theme: 'DARK',
    platform: 'ANDROID',
    preset: 'ANDROID',
    updatedAt: 'APR 04 16:02',
    coverage: 0.41,
    status: 'critical',
  },
  {
    id: 'ct-004',
    title: 'ASSET / DETAIL',
    group: 'COINBASE',
    flow: 'TRADE',
    theme: 'DARK',
    platform: 'WEB',
    preset: '1024',
    updatedAt: 'APR 04 15:32',
    coverage: 0.77,
    status: 'neutral',
  },
  {
    id: 'ct-005',
    title: 'CHECKOUT / FEES',
    group: 'REVOLUT',
    flow: 'BUY',
    theme: 'LIGHT',
    platform: 'WEB',
    preset: '720',
    updatedAt: 'APR 04 13:14',
    coverage: 0.88,
    status: 'good',
  },
  {
    id: 'ct-006',
    title: 'SECURITY / OTP',
    group: 'METAMASK',
    flow: 'SECURITY',
    theme: 'DARK',
    platform: 'IOS',
    preset: 'IOS',
    updatedAt: 'APR 04 11:56',
    coverage: 0.52,
    status: 'warning',
  },
];

function statusLabel(status: CtestStatus) {
  if (status === 'good') return 'HEALTHY';
  if (status === 'warning') return 'CAUTION';
  if (status === 'critical') return 'ALERT';
  return 'STABLE';
}

export function CatalogueCtestPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<CtestView>('grid');

  const filtered = useMemo(() => {
    const value = query.trim().toUpperCase();
    if (!value) return CTEST_DATA;

    return CTEST_DATA.filter((card) => (
      card.title.includes(value)
      || card.group.includes(value)
      || card.flow.includes(value)
      || card.platform.includes(value)
      || card.preset.includes(value)
    ));
  }, [query]);

  return (
    <div className="catalogue-page catalogue-page--ctest ctest-page">
      <div className="ctest-page__grid" aria-hidden="true" />

      <CatalogueHeader
        activeSection="catalogue"
        canViewTeam={false}
        onBack={() => { window.location.href = '/designer/catalogue'; }}
        onOpenSettings={() => { window.location.href = '/designer/catalogue'; }}
        onSectionChange={() => { window.location.href = '/designer/catalogue'; }}
      />

      <main className="catalogue-main ctest-main">
        <div className="catalogue-shell ctest-shell">
          <div className="catalogue-body ctest-body">
            <section className="ctest-hero" aria-label="ctest heading">
              <p className="ctest-label">CATALOGUE TEST LAB</p>
              <h2>NOTHING CATALOGUE / CTEST</h2>
            </section>

            <section className="catalogue-toolbar ctest-toolbar">
              <div className="catalogue-toolbar-left ctest-toolbar-left">
                <div className="catalogue-view-toggle ctest-view-toggle" role="tablist" aria-label="Test views">
                  {(['grid', 'list', 'matrix'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={view === option}
                      className={`catalogue-view-toggle__btn ctest-view-toggle__btn ${view === option ? 'is-active' : ''}`}
                      onClick={() => setView(option)}
                      title={`${option} view`}
                    >
                      {option === 'grid' ? 'G' : option === 'list' ? 'L' : 'M'}
                    </button>
                  ))}
                </div>

                <span className="ctest-toolbar-chip">{filtered.length} RESULTS</span>
                <span className="ctest-toolbar-chip">DESIGN MODE</span>
              </div>

              <div className="catalogue-toolbar-right ctest-toolbar-right">
                <label className="catalogue-search ctest-search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="FILTER / GROUP / FLOW"
                  />
                </label>
              </div>
            </section>

            {view === 'grid' ? (
              <section className="catalogue-content ctest-content">
                <section className="catalogue-section">
                  <h3 className="catalogue-section-title ctest-section-title">
                    Latest References
                    <span className="catalogue-section-count">{filtered.length}</span>
                  </h3>

                  <div className="catalogue-grid catalogue-grid--families ctest-cards" aria-label="Nothing style catalogue test cards">
                    {filtered.map((card) => {
                      const activeSegments = Math.round(card.coverage * 16);

                      return (
                        <article key={card.id} className="catalogue-family-card ctest-card">
                          <div className="ctest-card__preview" aria-hidden="true">
                            <div className="ctest-card__noise" />
                            <div className="ctest-card__wire" />
                            <div className="ctest-card__wire" />
                            <div className="ctest-card__wire" />
                          </div>

                          <div className="ctest-card__body">
                            <div className="ctest-card__top">
                              <span className="ctest-label">{card.group}</span>
                              <span className={`ctest-status ctest-status--${card.status}`}>{statusLabel(card.status)}</span>
                            </div>

                            <h2>{card.title}</h2>

                            <div className="ctest-card__meta">
                              <span>{card.flow}</span>
                              <span>{card.theme}</span>
                              <span>{card.platform}</span>
                              <span>{card.preset}</span>
                            </div>

                            <div className="ctest-segments" role="img" aria-label={`Coverage ${Math.round(card.coverage * 100)} percent`}>
                              {Array.from({ length: 16 }).map((_, index) => (
                                <span
                                  key={`${card.id}-${index}`}
                                  className={`ctest-segments__part ${index < activeSegments ? `is-${card.status}` : ''}`}
                                />
                              ))}
                            </div>

                            <div className="ctest-card__foot">
                              <span className="ctest-label">UPDATED {card.updatedAt}</span>
                              <strong>{Math.round(card.coverage * 100)}%</strong>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </section>
            ) : (
              <section className="catalogue-content ctest-content">
                <section className="ctest-table" aria-label="Nothing style list test">
                  <header className="ctest-table__row ctest-table__row--head">
                    <span>SCREEN</span>
                    <span>GROUP</span>
                    <span>FLOW</span>
                    <span>STATUS</span>
                    <span>COVERAGE</span>
                    <span>UPDATED</span>
                  </header>

                  <div className="ctest-table__body">
                    {filtered.map((card) => (
                      <article key={card.id} className="ctest-table__row">
                        <span>{card.title}</span>
                        <span>{card.group}</span>
                        <span>{card.flow}</span>
                        <span className={`ctest-status ctest-status--${card.status}`}>{statusLabel(card.status)}</span>
                        <span>{Math.round(card.coverage * 100)}%</span>
                        <span>{card.updatedAt}</span>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
