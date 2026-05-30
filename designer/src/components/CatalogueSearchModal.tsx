import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, CornerDownLeft, Image as ImageIcon, LayoutGrid, Search as SearchIcon, Workflow, X } from 'lucide-react';

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
import {
  buildEntityCatalog,
  entityKindLabel,
  findEntitySuggestionsForToken,
  isStopWord,
  type EntityChip,
  type EntitySuggestion,
} from '../lib/catalogue-search-entities';
import type { CatalogueGroupAppearanceMap } from '../lib/catalogue-group-appearance';
import { resolveCatalogueGroupAppearance } from '../lib/catalogue-group-appearance';
import type { ScreenshotNode } from '../types';
import { ThumbHashImage } from './ThumbHashImage';

export interface CommitSearchPayload {
  query: string;
  chips: EntityChip[];
}

interface CatalogueSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  screenshots: ScreenshotNode[];
  // Used to render the user-uploaded group icon when available;
  // falls back to a generic LayoutGrid Lucide when not.
  appearanceMap: CatalogueGroupAppearanceMap;
  onSelectGroup: (group: string) => void;
  onSelectFlow: (group: string, flow: string) => void;
  // Open the lightbox directly on a specific screenshot. Fired when a
  // user picks a screenshot result (click or Enter while highlighted).
  // We pass the whole ScreenshotNode (not just the id) so the parent
  // can build a synthetic single-variant family at click time, without
  // having to resolve through the family map — which can lag the
  // full-scope hydration and silently fall back to the wrong variant.
  onOpenScreenshot: (screenshot: ScreenshotNode) => void;
  // Commit the search into the catalogue scope — modal closes and
  // the catalogue grid scopes itself to the search query AND every
  // accepted entity chip. Triggered by the "View all in catalogue"
  // CTA, Cmd/Ctrl+Enter, or plain Enter when the user hasn't
  // manually picked a specific result.
  onCommitSearch: (payload: CommitSearchPayload) => void;
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
  onOpenScreenshot,
  onCommitSearch,
}: CatalogueSearchModalProps) {
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<EntityChip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tracks whether the user has manually picked a result (hover or
  // arrow key). Plain Enter without interaction commits the query;
  // Enter after interaction jumps to the specific result.
  const [hasInteracted, setHasInteracted] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setChips([]);
    setActiveIndex(0);
    setHasInteracted(false);
    setRecents(loadRecents());
    // Defer focus so the input is in the DOM by the time we call focus.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // Entity catalog — rebuilt when the screenshot list changes (rare
  // mid-modal). Memoised so the matcher is cheap on every keystroke.
  const entityCatalog = useMemo(() => buildEntityCatalog(screenshots), [screenshots]);

  // Suggestions are computed from the LAST whitespace-delimited token
  // the user is typing. We deliberately don't suggest off every token
  // because the modal would be loud and the user usually wants to
  // chip whatever they're currently writing.
  const suggestions = useMemo(() => {
    const tokensRaw = query.split(/\s+/).filter((t) => t.length > 0);
    const lastToken = tokensRaw[tokensRaw.length - 1] ?? '';
    if (lastToken.length < 1 || isStopWord(lastToken)) return [];
    return findEntitySuggestionsForToken(lastToken, entityCatalog, chips);
  }, [query, entityCatalog, chips]);

  const results = useMemo(
    () => deriveSearchResults({ screenshots, query, chips }),
    [screenshots, query, chips],
  );
  // Same tokeniser as the search lib so highlight ranges always match
  // what the matcher saw.
  const tokens = useMemo(() => tokensFromQuery(query), [query]);
  const flat = useMemo(
    () => flattenResults(results.groups, results.flows, results.screenshots),
    [results],
  );
  // Combined nav list: suggestions first, then result rows. Arrow
  // keys cycle through this combined list.
  const navList = useMemo(
    () => [
      ...suggestions.map((s) => ({ type: 'suggestion' as const, value: s })),
      ...flat.map((r) => ({ type: 'result' as const, value: r })),
    ],
    [suggestions, flat],
  );

  // Reset highlight when query changes so the first new result is
  // selected. Also reset the interaction flag — a fresh query string
  // means the user is back to "I want to commit this," not "I want
  // to jump to that specific previously-selected result."
  useEffect(() => {
    setActiveIndex(0);
    setHasInteracted(false);
  }, [query]);

  // Scroll active row into view as it moves.
  useEffect(() => {
    if (!isOpen) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  function selectResult(result: SearchResult) {
    if (result.type === 'group') {
      pushRecent(query);
      onSelectGroup(result.name);
      onClose();
      return;
    }
    if (result.type === 'flow') {
      pushRecent(query);
      onSelectFlow(result.group, result.name);
      onClose();
      return;
    }
    // Screenshot card: open the lightbox directly on this screenshot.
    // (Previously this refilled the input with the screenshot's full
    // name to let the user narrow first; that meant 3 clicks to reach
    // the lightbox. Direct-open is the natural intent.)
    pushRecent(query);
    onOpenScreenshot(result.screenshot);
    onClose();
  }

  // Accept an entity suggestion → convert into a chip + remove the
  // matched token from the input so the user can keep typing.
  function acceptSuggestion(suggestion: EntitySuggestion) {
    setChips((previous) => [...previous, {
      kind: suggestion.kind,
      value: suggestion.value,
      displayValue: suggestion.displayValue,
    }]);
    // Remove the FIRST occurrence of the matched token (case-insensitive)
    // from the query — typically the last typed token, but be tolerant
    // if the user has typed past it.
    const tokenRe = new RegExp(`\\b${suggestion.matchedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    setQuery((previous) => previous.replace(tokenRe, '').replace(/\s{2,}/g, ' ').trimStart());
    inputRef.current?.focus();
  }

  function removeChip(index: number) {
    setChips((previous) => previous.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function selectRecent(entry: RecentEntry) {
    setQuery(entry.query);
    setRecents(pushRecent(entry.query));
    inputRef.current?.focus();
  }

  function commitSearch() {
    const trimmed = query.trim();
    // Permit commit on chips alone (no text). Bail only if BOTH are empty.
    if (!trimmed && chips.length === 0) return;
    if (trimmed) pushRecent(trimmed);
    onCommitSearch({ query: trimmed, chips });
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    // Tab — accept the active suggestion (if any) and convert it into
    // a chip. Power-user keyboard shortcut from Linear / GitHub. Falls
    // through to default Tab behavior if there are no suggestions.
    if (event.key === 'Tab' && !event.shiftKey && suggestions.length > 0) {
      event.preventDefault();
      // If a suggestion is highlighted, accept that one; otherwise
      // accept the first (top) suggestion as the "best guess."
      const target = navList[activeIndex];
      if (target && target.type === 'suggestion') {
        acceptSuggestion(target.value);
      } else {
        acceptSuggestion(suggestions[0]);
      }
      return;
    }
    // Backspace on empty input — pop the most recent chip. Common
    // pattern in chip-input UIs (GitHub Issues, Linear filters).
    if (event.key === 'Backspace' && query.length === 0 && chips.length > 0) {
      event.preventDefault();
      setChips((previous) => previous.slice(0, -1));
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      if (navList.length === 0) return;
      event.preventDefault();
      setHasInteracted(true);
      setActiveIndex((previous) => (previous + 1) % navList.length);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      if (navList.length === 0) return;
      event.preventDefault();
      setHasInteracted(true);
      setActiveIndex((previous) => (previous - 1 + navList.length) % navList.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Cmd/Ctrl+Enter always commits; explicit "see all results" shortcut.
      if (event.metaKey || event.ctrlKey) {
        commitSearch();
        return;
      }
      // Plain Enter with no manual selection → commit so the user
      // sees every match in the catalogue grid. Otherwise act on
      // whatever's highlighted: suggestion → chip, result → jump.
      if (!hasInteracted && (query.trim().length > 0 || chips.length > 0)) {
        commitSearch();
        return;
      }
      if (navList.length === 0) return;
      const target = navList[activeIndex];
      if (!target) return;
      if (target.type === 'suggestion') {
        acceptSuggestion(target.value);
        return;
      }
      selectResult(target.value);
    }
  }

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const hasResults = flat.length > 0;
  // "Active" means the user has typed anything or accepted any chip —
  // either signals real search intent and unlocks the result panel.
  const isActive = hasQuery || chips.length > 0;
  // Suggestions occupy nav indices [0..suggestions.length); results
  // start at suggestions.length. Used when rendering result rows so
  // their data-result-index matches navList ordering.
  const resultIndexOffset = suggestions.length;

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
          <div className="catalogue-search-modal__chiprow">
            {chips.map((chip, index) => (
              <span
                key={`${chip.kind}:${chip.value}:${index}`}
                className={`catalogue-search-modal__chip catalogue-search-modal__chip--${chip.kind}`}
              >
                <span className="catalogue-search-modal__chip-kind">{entityKindLabel(chip.kind)}</span>
                <span className="catalogue-search-modal__chip-value">{chip.displayValue}</span>
                <button
                  type="button"
                  className="catalogue-search-modal__chip-x"
                  onClick={() => removeChip(index)}
                  aria-label={`Remove ${entityKindLabel(chip.kind)} filter ${chip.displayValue}`}
                  tabIndex={-1}
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              className="catalogue-search-modal__input"
              placeholder={chips.length === 0 ? 'Search Groups, Flows, Screenshots…' : ''}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
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
          {!isActive && (
            <div className="catalogue-search-modal__empty">
              <p>Type to search Groups, Flows, Screenshots — or accept a chip suggestion as you type.</p>
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

          {/* Entity suggestions — surfaced as the user types tokens
              that match real catalogue entities. Tab / Enter on a
              highlighted suggestion converts it into a chip. */}
          {isActive && suggestions.length > 0 && (
            <section className="catalogue-search-modal__section catalogue-search-modal__section--suggestions">
              <div className="catalogue-search-modal__section-label">
                Suggestions <span className="catalogue-search-modal__section-count">· press Tab to add</span>
              </div>
              {suggestions.map((suggestion, index) => {
                const navIndex = index;
                return (
                  <button
                    key={`${suggestion.kind}:${suggestion.value}`}
                    type="button"
                    data-result-index={navIndex}
                    className={`catalogue-search-modal__row catalogue-search-modal__row--suggestion catalogue-search-modal__row--${suggestion.kind}${activeIndex === navIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => { setActiveIndex(navIndex); setHasInteracted(true); }}
                    onClick={() => acceptSuggestion(suggestion)}
                  >
                    <span className="catalogue-search-modal__row-icon">
                      {suggestion.kind === 'group' ? <LayoutGrid size={13} aria-hidden="true" />
                        : suggestion.kind === 'flow' ? <Workflow size={13} aria-hidden="true" />
                          : <span className="catalogue-search-modal__row-kindbadge">{entityKindLabel(suggestion.kind).slice(0, 2)}</span>}
                    </span>
                    <span className="catalogue-search-modal__row-main">
                      <strong>{suggestion.displayValue}</strong>
                      <span className="catalogue-search-modal__row-sub">as {entityKindLabel(suggestion.kind)} filter · {suggestion.hitCount} screen{suggestion.hitCount === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          {isActive && !hasResults && suggestions.length === 0 && (
            <div className="catalogue-search-modal__empty">
              <p>No matches{query.trim() ? <> for <strong>{query}</strong></> : null}.</p>
            </div>
          )}

          {isActive && hasResults && (
            <>
              {results.screenshots.length > 0 && (
                <section className="catalogue-search-modal__section catalogue-search-modal__section--cards">
                  <div className="catalogue-search-modal__section-label">
                    Screenshots <span className="catalogue-search-modal__section-count">· {results.screenshotsTotal} match{results.screenshotsTotal === 1 ? '' : 'es'}</span>
                  </div>
                  <div className="catalogue-search-modal__cards">
                    {results.screenshots.map((result, index) => {
                      const flatIndex = resultIndexOffset + index;
                      return (
                        <button
                          key={result.id}
                          type="button"
                          data-result-index={flatIndex}
                          className={`catalogue-search-modal__card${activeIndex === flatIndex ? ' is-active' : ''}`}
                          onMouseEnter={() => { setActiveIndex(flatIndex); setHasInteracted(true); }}
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
                      <button
                        type="button"
                        className="catalogue-search-modal__card catalogue-search-modal__card--more"
                        onClick={commitSearch}
                      >
                        <span className="catalogue-search-modal__card-thumb catalogue-search-modal__card-thumb--more">
                          +{results.screenshotsTotal - results.screenshots.length}
                        </span>
                        <span className="catalogue-search-modal__card-body">
                          <span className="catalogue-search-modal__card-title">View all</span>
                          <span className="catalogue-search-modal__card-meta">in catalogue</span>
                        </span>
                      </button>
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
                    const flatIndex = resultIndexOffset + results.screenshots.length + index;
                    const appearance = resolveCatalogueGroupAppearance(appearanceMap, result.name, null);
                    return (
                      <button
                        key={result.id}
                        type="button"
                        data-result-index={flatIndex}
                        className={`catalogue-search-modal__row${activeIndex === flatIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => { setActiveIndex(flatIndex); setHasInteracted(true); }}
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
                    const flatIndex = resultIndexOffset + results.screenshots.length + results.groups.length + index;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        data-result-index={flatIndex}
                        className={`catalogue-search-modal__row${activeIndex === flatIndex ? ' is-active' : ''}`}
                        onMouseEnter={() => { setActiveIndex(flatIndex); setHasInteracted(true); }}
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

        {isActive && hasResults && (
          <button
            type="button"
            className="catalogue-search-modal__commit"
            onClick={commitSearch}
          >
            <span className="catalogue-search-modal__commit-label">
              View all {results.groupsTotal + results.flowsTotal + results.screenshotsTotal} results in catalogue
            </span>
            <span className="catalogue-search-modal__commit-hint">
              or press <kbd><CornerDownLeft size={11} aria-hidden="true" /></kbd>
            </span>
          </button>
        )}

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
            <kbd>/</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}
