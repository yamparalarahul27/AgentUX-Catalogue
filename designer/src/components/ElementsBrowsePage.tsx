import { useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';

import {
  buildElementCatalog,
  type ElementKind,
} from '../lib/element-catalog';
import { useCatalogueFullScope } from '../hooks/use-catalogue-full-scope';
import notFoundIllustration from '../assets/not-found.png';
import { CatalogueHeader } from './CatalogueHeader';
import { ElementCard } from './ElementCard';

type TabKind = 'all' | ElementKind;
type SortMode = 'alpha' | 'count';

interface ElementsBrowsePageProps {
  user: User;
  onLogout: () => void;
  onLogoutEverywhere: () => void;
}

export function ElementsBrowsePage({ user, onLogout, onLogoutEverywhere }: ElementsBrowsePageProps) {
  const navigate = useNavigate();
  const { screenshots, loading } = useCatalogueFullScope();

  const [activeTab, setActiveTab] = useState<TabKind>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');

  // Catalog is heavy to compute (every screenshot's label arrays) —
  // memoise on the screenshot array reference.
  const catalog = useMemo(() => buildElementCatalog(screenshots), [screenshots]);

  // Per-tab counts for the sub-tab badges. Computed once per catalog
  // change, not per render.
  const counts = useMemo(() => {
    let ui = 0, ux = 0, page = 0;
    for (const entry of catalog) {
      if (entry.kind === 'ui') ui += 1;
      else if (entry.kind === 'ux') ux += 1;
      else page += 1;
    }
    return { all: catalog.length, ui, ux, page };
  }, [catalog]);

  const visible = useMemo(() => {
    let list = catalog;
    if (activeTab !== 'all') list = list.filter((entry) => entry.kind === activeTab);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((entry) => entry.name.toLowerCase().includes(q));
    }
    // Stable sort: alphabetical by default, count desc as the
    // secondary option. Within ties, fall back to slug for
    // determinism.
    const sorted = [...list].sort((a, b) => {
      if (sortMode === 'count') {
        if (a.screenshots.length !== b.screenshots.length) {
          return b.screenshots.length - a.screenshots.length;
        }
      }
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [catalog, activeTab, searchQuery, sortMode]);

  return (
    <div className="catalogue-page">
      <CatalogueHeader
        activeSection="elements"
        canAdmin={false}
        canLabelingStudio={false}
        onOpenSettings={() => { /* no-op on browse page */ }}
        onSectionChange={(section) => {
          if (section === 'elements') return;
          if (section === 'catalogue') navigate('/');
          else navigate('/');
        }}
        userEmail={user.email ?? null}
        onSignIn={() => { /* signed in already on this route */ }}
        onLogout={onLogout}
        onLogoutEverywhere={onLogoutEverywhere}
        myBookmarksActive={false}
        onToggleMyBookmarks={() => { /* no-op */ }}
        onOpenWhatsNew={() => { /* no-op on this page */ }}
        whatsNewUnseenCount={0}
      />

      <main className="catalogue-main catalogue-elements">
        <header className="catalogue-elements__head">
          <h1 className="catalogue-elements__title">Elements</h1>
          <p className="catalogue-elements__lede">
            Browse {counts.all} distinct UI elements, patterns, and page types across {screenshots.length} screenshots.
            Click any card to see every screenshot using it.
          </p>
        </header>

        <div className="catalogue-elements__subtabs" role="tablist" aria-label="Element kind">
          <TabButton kind="all" active={activeTab === 'all'} count={counts.all} onClick={() => setActiveTab('all')} />
          <TabButton kind="ui" active={activeTab === 'ui'} count={counts.ui} onClick={() => setActiveTab('ui')} />
          <TabButton kind="ux" active={activeTab === 'ux'} count={counts.ux} onClick={() => setActiveTab('ux')} />
          <TabButton kind="page" active={activeTab === 'page'} count={counts.page} onClick={() => setActiveTab('page')} />
        </div>

        <div className="catalogue-elements__toolbar">
          <div className="catalogue-elements__search">
            <SearchIcon size={14} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search elements…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              spellCheck={false}
            />
          </div>
          <label className="catalogue-elements__sort">
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="alpha">Alphabetical</option>
              <option value="count">By count</option>
            </select>
          </label>
        </div>

        {loading && catalog.length === 0 ? (
          <p className="catalogue-elements__empty">Loading the catalogue…</p>
        ) : visible.length === 0 ? (
          <div className="catalogue-elements__empty">
            <img src={notFoundIllustration} alt="" className="empty-state__illustration" />
            <p>
              {searchQuery
                ? <>No elements match <strong>{searchQuery}</strong>.</>
                : 'No labelled screenshots yet. Add labels in the Labelling Studio to populate this page.'}
            </p>
          </div>
        ) : (
          <div className="catalogue-elements__grid">
            {visible.map((entry) => (
              <ElementCard key={`${entry.kind}:${entry.slug}`} entry={entry} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface TabButtonProps {
  kind: TabKind;
  active: boolean;
  count: number;
  onClick: () => void;
}

function TabButton({ kind, active, count, onClick }: TabButtonProps) {
  const label = kind === 'all' ? 'All'
    : kind === 'ui' ? 'UI Elements'
    : kind === 'ux' ? 'UX Patterns'
    : 'Page Types';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`catalogue-elements__subtab${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {kind !== 'all' && <span className={`catalogue-elements__kind-dot catalogue-elements__kind-dot--${kind}`} aria-hidden="true" />}
      {label}
      <span className="catalogue-elements__subtab-count">{count}</span>
    </button>
  );
}
