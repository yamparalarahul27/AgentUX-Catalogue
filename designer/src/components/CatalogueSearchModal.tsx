import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Command, CornerDownLeft, Image as ImageIcon, LayoutGrid, Search as SearchIcon, Workflow, X } from 'lucide-react';

import { Fragment, type ReactNode } from 'react';
import {
  deriveSearchResults,
  loadRecents,
  pushRecent,
  tokensFromQuery,
  type GroupResult,
  type FlowResult,
  type RecentEntry,
  type ScreenshotResult,
  type SearchResult,
} from '../lib/catalogue-search';
import type { CatalogueGroupAppearanceMap } from '../lib/catalogue-group-appearance';
import { resolveCatalogueGroupAppearance } from '../lib/catalogue-group-appearance';
import type { ScreenshotNode } from '../types';
import { ThumbHashImage } from './ThumbHashImage';

interface CatalogueSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenshots: ScreenshotNode[];
  // Used to render the user-uploaded group icon when available;
  // falls back to a generic LayoutGrid Lucide when not.
  appearanceMap: CatalogueGroupAppearanceMap;
  onSelectGroup: (group: string) => void;
  onSelectFlow: (group: string, flow: string) => void;
  onSelectScreenshot: (screenshot: ScreenshotNode) => void;
}

// Build a flat ordered list of results so keyboard nav (↑↓) can move
// across category boundaries without each section managing its own
// index. Screenshots come FIRST because that's the most common intent
// when searching — Enter on default selection should land on a
// concrete screenshot, not a group filter.
function flattenResults(groups: GroupResult[], flows: FlowResult[], screenshots: ScreenshotResult[]): SearchResult[] {
  return [...screenshots, ...groups, ...flows];
}

// Wrap any token-matching substring in `<mark>` so the user can see
// WHY a result matched. Case-insensitive; tokens come from the same
// tokeniser as the matcher. Empty / no-match strings pass through
// unchanged.
function highlightMatch(text: string, tokens: string[]): ReactNode {
  if (!text || tokens.length === 0) return text;
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  const lowerTokens = new Set(tokens.map((token) => token.toLowerCase()));
  return parts.map((part, index) => {
    if (!part) return null;
    const isHit = lowerTokens.has(part.toLowerCase());
    return isHit
      ? <mark key={index} className="catalogue-search-modal__hl">{part}</mark>
      : <Fragment key={index}>{part}</Fragment>;
  });
}

export function CatalogueSearchModal({
  isOpen,
  onClose,
  screenshots,
  appearanceMap,
  onSelectGroup,
  onSelectFlow,
  onSelectScreenshot,
}: CatalogueSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    setRecents(loadRecents());
    // Defer focus so the input is in the DOM by the time we call focus.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const results = useMemo(() => deriveSearchResults({ screenshots, query }), [screenshots, query]);
  // Same tokeniser as the search lib so highlight ranges always match
  // what the matcher saw.
  const tokens = useMemo(() => tokensFromQuery(query), [query]);
  const flat = useMemo(
    () => flattenResults(results.groups, results.flows, results.screenshots),
    [results],
  );

  // Reset highlight when query changes so the first new result is selected.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active row into view as it moves.
  useEffect(() => {
    if (!isOpen) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  function selectResult(result: SearchResult) {
    pushRecent(query);
    if (result.type === 'group') {
      onSelectGroup(result.name);
    } else if (result.type === 'flow') {
      onSelectFlow(result.group, result.name);
    } else {
      onSelectScreenshot(result.screenshot);
    }
    onClose();
  }

  function selectRecent(entry: RecentEntry) {
    setQuery(entry.query);
    setRecents(pushRecent(entry.query));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (flat.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveIndex((previous) => (previous + 1) % flat.length);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveIndex((previous) => (previous - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = flat[activeIndex];
      if (result) selectResult(result);
    }
  }

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const hasResults = flat.length > 0;

  return (
    <div
      className="catalogue-search-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="catalogue-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search catalogue"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="catalogue-search-modal__field">
          <SearchIcon size={18} aria-hidden="true" className="catalogue-search-modal__field-icon" />
          <input
            ref={inputRef}
            type="text"
            className="catalogue-search-modal__input"
            placeholder="Search Groups, Flows, Screenshots…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="catalogue-search-modal__close"
            onClick={onClose}
            aria-label="Close search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div ref={listRef} className="catalogue-search-modal__results">
          {!hasQuery && (
            <div className="catalogue-search-modal__empty">
              <p>Type to search across Groups, Flows, and Screenshots.</p>
              {recents.length > 0 && (
                <div className="catalogue-search-modal__recents">
                  <div className="catalogue-search-modal__section-label">Recents</div>
                  {recents.map((entry) => (
                    <button
                      key={entry.query}
                      type="button"
                      className="catalogue-search-modal__row catalogue-search-modal__row--recent"
                      onClick={() => selectRecent(entry)}
                    >
                      <span className="catalogue-search-modal__row-icon">
                        <Clock size={13} aria-hidden="true" />
                      </span>
                      <span className="catalogue-search-modal__row-main">{entry.query}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasQuery && !hasResults && (
            <div className="catalogue-search-modal__empty">
              <p>No matches for <strong>{query}</strong>.</p>
            </div>
          )}

          {hasQuery && hasResults && (
            <>
              {results.screenshots.length > 0 && (
                <section className="catalogue-search-modal__section catalogue-search-modal__section--cards">
                  <div className="catalogue-search-modal__section-label">
                    Screenshots <span className="catalogue-search-modal__section-count">· {results.screenshotsTotal} match{results.screenshotsTotal === 1 ? '' : 'es'}</span>
                  </div>
                  <div className="catalogue-search-modal__cards">
                    {results.screenshots.map((result, index) => {
                      const flatIndex = index;
                      return (
                        <button
                          key={result.id}
                          type="button"
                          data-result-index={flatIndex}
                          className={`catalogue-search-modal__card${activeIndex === flatIndex ? ' is-active' : ''}`}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => selectResult(result)}
                        >
                          <span className="catalogue-search-modal__card-thumb">
                            {result.screenshot.image_url ? (
                              <ThumbHashImage
                                src={result.screenshot.image_url}
                                thumbHash={result.screenshot.thumb_hash ?? null}
                                alt=""
                              />
                            ) : (
                              <ImageIcon size={20} aria-hidden="true" />
                            )}
                          </span>
                          <span className="catalogue-search-modal__card-body">
                            <span className="catalogue-search-modal__card-title">{highlightMatch(result.screenshot.name, tokens)}</span>
                            <span className="catalogue-search-modal__card-meta">{result.meta}</span>
                          </span>
                        </button>
                      );
                    })}
                    {results.screenshotsTotal > results.screenshots.length && (
                      <div className="catalogue-search-modal__card catalogue-search-modal__card--more" aria-hidden="true">
                        <span className="catalogue-search-modal__card-thumb catalogue-search-modal__card-thumb--more">
                          +{results.screenshotsTotal - results.screenshots.length}
                        </span>
                        <span className="catalogue-search-modal__card-body">
                          <span className="catalogue-search-modal__card-title">more</span>
                          <span className="catalogue-search-modal__card-meta">refine query to see them</span>
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {results.groups.length > 0 && (
                <section className="catalogue-search-modal__section">
                  <div className="catalogue-search-modal__section-label">
                    Groups <span className="catalogue-search-modal__section-count">· {results.groupsTotal} match{results.groupsTotal === 1 ? '' : 'es'}</span>
                  </div>
                  {results.groups.map((result, index) => {
                    const flatIndex = results.screenshots.length + index;
                    const appearance = resolveCatalogueGroupAppearance(appearanceMap, result.name, null);
                    return (
                      <button
                        key={result.id}
                        type="button"
                        data-result-index={flatIndex}
                        className={`catalogue-search-modal__row${activeIndex === flatIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => selectResult(result)}
                      >
                        <span className="catalogue-search-modal__row-icon catalogue-search-modal__row-icon--group">
                          {appearance.iconUrl ? (
                            <img src={appearance.iconUrl} alt="" />
                          ) : (
                            <LayoutGrid size={13} aria-hidden="true" />
                          )}
                        </span>
                        <span className="catalogue-search-modal__row-main">{highlightMatch(result.name, tokens)}</span>
                        <span className="catalogue-search-modal__row-meta">
                          {result.flowCount} flow{result.flowCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </section>
              )}

              {results.flows.length > 0 && (
                <section className="catalogue-search-modal__section">
                  <div className="catalogue-search-modal__section-label">
                    Flows <span className="catalogue-search-modal__section-count">· {results.flowsTotal} match{results.flowsTotal === 1 ? '' : 'es'}</span>
                  </div>
                  {results.flows.map((result, index) => {
                    const flatIndex = results.screenshots.length + results.groups.length + index;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        data-result-index={flatIndex}
                        className={`catalogue-search-modal__row${activeIndex === flatIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => selectResult(result)}
                      >
                        <span className="catalogue-search-modal__row-icon">
                          <Workflow size={13} aria-hidden="true" />
                        </span>
                        <span className="catalogue-search-modal__row-main">{highlightMatch(result.name, tokens)}</span>
                        <span className="catalogue-search-modal__row-meta">
                          {result.group} · {result.screenCount} screen{result.screenCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </section>
              )}
            </>
          )}
        </div>

        <div className="catalogue-search-modal__footer">
          <span className="catalogue-search-modal__footer-group">
            <kbd><ArrowUp size={11} aria-hidden="true" /></kbd>
            <kbd><ArrowDown size={11} aria-hidden="true" /></kbd>
            move
            <kbd><CornerDownLeft size={11} aria-hidden="true" /></kbd>
            select
            <kbd>Esc</kbd>
            close
          </span>
          <span className="catalogue-search-modal__footer-hint">
            <kbd><Command size={11} aria-hidden="true" /></kbd>
            <kbd>K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}
