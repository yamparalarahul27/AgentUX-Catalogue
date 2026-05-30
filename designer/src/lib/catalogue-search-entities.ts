// Entity-aware "Advance Search" — recognises tokens in the user's
// query that match real catalogue entities (group, flow, platform,
// theme, OS, AI-label tags) and offers to convert them into structured
// filter chips. The chips then drive the same toolbar filter state
// used by the rest of the catalogue, so search-via-chips and search-
// via-toolbar produce identical results.
//
// Lives alongside catalogue-search.ts (the text matcher) but is a
// separate module because the algorithms differ — text search is
// substring-over-haystack, entity matching is set-membership.

import type { ScreenshotNode } from '../types';
import { CATALOGUE_FLOW_LABEL_KEY } from './catalogue-families';

// ────────────────── Types ──────────────────

export type EntityKind =
  | 'group'
  | 'flow'
  | 'platform'
  | 'theme'
  | 'mobile_os'
  | 'page_type'
  | 'ui_element'
  | 'ux_pattern';

export interface EntityChip {
  kind: EntityKind;
  // Canonical machine value used by the filter pipeline: e.g. 'web',
  // 'ios', 'dark', or the verbatim group / flow / tag name.
  value: string;
  // Human display label: e.g. 'Web', 'iOS', 'Dark'. For groups +
  // flows + tag names this is the same as `value`.
  displayValue: string;
}

export interface EntitySuggestion extends EntityChip {
  // How many full-scope screenshots match this entity. Surfaced in
  // the suggestion list so the user can see "Coinbase · 42 screens"
  // before accepting the chip.
  hitCount: number;
  // The substring of the typed query that matched this entity. Used
  // to remove the matched token from the input box when the chip is
  // accepted (via Tab / click).
  matchedToken: string;
  // How strong the match was — drives the order of suggestions.
  // 3 = exact, 2 = prefix, 1 = substring. Highest first.
  strength: 1 | 2 | 3;
}

// ────────────────── Stop words ──────────────────

// Grammatical glue the user might type around real terms. Stripped
// before entity matching AND before text-search matching so that
// "screen in Weex" doesn't accidentally require "in" to appear in
// the haystack.
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at',
  'by',
  'for', 'from',
  'in', 'into', 'is',
  'of', 'on', 'or',
  'the', 'to',
  'with',
]);

export function isStopWord(token: string): boolean {
  return STOP_WORDS.has(token.toLowerCase());
}

// ────────────────── Entity catalog ──────────────────

export interface EntityCatalog {
  groups: Map<string, number>;
  flows: Map<string, number>;
  platforms: Map<'web' | 'mobile', number>;
  themes: Map<'light' | 'dark', number>;
  mobileOses: Map<'ios' | 'android', number>;
  pageTypes: Map<string, number>;
  uiElements: Map<string, number>;
  uxPatterns: Map<string, number>;
}

function getFlowLabel(screenshot: ScreenshotNode): string | null {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return null;
  const value = metadata[CATALOGUE_FLOW_LABEL_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getLabelArray(screenshot: ScreenshotNode, path: readonly string[]): string[] {
  const metadata = screenshot.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return [];
  const label = metadata.label;
  if (!label || typeof label !== 'object') return [];
  let cursor: unknown = label;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return [];
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (!Array.isArray(cursor)) return [];
  return cursor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function bump<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

// Build the full entity catalog from the in-memory screenshot array.
// Memoise the result in the caller — this iterates every screenshot
// once and is O(N * label-array-sizes), cheap but not free.
export function buildEntityCatalog(screenshots: ScreenshotNode[]): EntityCatalog {
  const catalog: EntityCatalog = {
    groups: new Map(),
    flows: new Map(),
    platforms: new Map(),
    themes: new Map(),
    mobileOses: new Map(),
    pageTypes: new Map(),
    uiElements: new Map(),
    uxPatterns: new Map(),
  };

  for (const shot of screenshots) {
    if (shot.group) bump(catalog.groups, shot.group);
    const flow = getFlowLabel(shot);
    if (flow) bump(catalog.flows, flow);
    if (shot.platform === 'web' || shot.platform === 'mobile') bump(catalog.platforms, shot.platform);
    if (shot.theme === 'light' || shot.theme === 'dark') bump(catalog.themes, shot.theme);
    if (shot.mobile_os === 'ios' || shot.mobile_os === 'android') bump(catalog.mobileOses, shot.mobile_os);
    for (const value of getLabelArray(shot, ['identity', 'page_types'])) bump(catalog.pageTypes, value);
    for (const value of getLabelArray(shot, ['screen_analysis', 'ui_elements'])) bump(catalog.uiElements, value);
    for (const value of getLabelArray(shot, ['screen_analysis', 'ux_patterns'])) bump(catalog.uxPatterns, value);
  }

  return catalog;
}

// ────────────────── Display labels ──────────────────

// Convert a canonical machine value into its human label.
export function entityDisplayValue(kind: EntityKind, value: string): string {
  if (kind === 'platform') {
    if (value === 'web') return 'Web';
    if (value === 'mobile') return 'Mobile';
  }
  if (kind === 'theme') {
    if (value === 'light') return 'Light';
    if (value === 'dark') return 'Dark';
  }
  if (kind === 'mobile_os') {
    if (value === 'ios') return 'iOS';
    if (value === 'android') return 'Android';
  }
  // group, flow, page_type, ui_element, ux_pattern: display = value
  return value;
}

// Human-friendly label for a chip's kind. Used in the chip prefix
// ("Flow", "Group", "Platform") and in the suggestion hint.
export function entityKindLabel(kind: EntityKind): string {
  switch (kind) {
    case 'group': return 'Group';
    case 'flow': return 'Flow';
    case 'platform': return 'Platform';
    case 'theme': return 'Theme';
    case 'mobile_os': return 'OS';
    case 'page_type': return 'Page type';
    case 'ui_element': return 'UI element';
    case 'ux_pattern': return 'UX pattern';
  }
}

// ────────────────── Matcher ──────────────────

interface MatchPair {
  // The canonical value of the matched entity.
  value: string;
  // The hit count from the catalog (for suggestion display + sort).
  hitCount: number;
  strength: 1 | 2 | 3;
}

// Score one token against one entity-value set. Returns matches sorted
// strongest-first. Exact match (`token === value.toLowerCase()`) is 3;
// prefix match (`value.startsWith(token)`) is 2; substring is 1.
function matchTokenAgainst(token: string, source: Map<string, number>): MatchPair[] {
  const lcToken = token.toLowerCase();
  const out: MatchPair[] = [];
  for (const [value, hitCount] of source) {
    const lcValue = value.toLowerCase();
    if (lcValue === lcToken) {
      out.push({ value, hitCount, strength: 3 });
      continue;
    }
    if (lcValue.startsWith(lcToken)) {
      out.push({ value, hitCount, strength: 2 });
      continue;
    }
    if (lcValue.includes(lcToken)) {
      out.push({ value, hitCount, strength: 1 });
    }
  }
  return out.sort((a, b) => b.strength - a.strength || b.hitCount - a.hitCount);
}

// Find every entity suggestion that matches the given token across
// every entity kind. Used to drive the live suggestion dropdown.
// `excluded` is the list of chips already in the query — we hide
// suggestions that would duplicate an existing chip.
export function findEntitySuggestionsForToken(
  token: string,
  catalog: EntityCatalog,
  excluded: EntityChip[],
): EntitySuggestion[] {
  if (token.length === 0 || isStopWord(token)) return [];

  const isExcluded = (kind: EntityKind, value: string): boolean =>
    excluded.some((chip) => chip.kind === kind && chip.value === value);

  const out: EntitySuggestion[] = [];
  const collect = (kind: EntityKind, source: Map<string, number>) => {
    for (const match of matchTokenAgainst(token, source)) {
      if (isExcluded(kind, match.value)) continue;
      out.push({
        kind,
        value: match.value,
        displayValue: entityDisplayValue(kind, match.value),
        hitCount: match.hitCount,
        matchedToken: token,
        strength: match.strength,
      });
    }
  };

  collect('group', catalog.groups);
  collect('flow', catalog.flows);
  collect('platform', catalog.platforms);
  collect('theme', catalog.themes);
  collect('mobile_os', catalog.mobileOses);
  collect('page_type', catalog.pageTypes);
  collect('ui_element', catalog.uiElements);
  collect('ux_pattern', catalog.uxPatterns);

  // Strongest matches first, then highest hit count, capped to keep
  // the dropdown scannable. Power users with a precise token still
  // see exact matches at the top.
  return out
    .sort((a, b) => b.strength - a.strength || b.hitCount - a.hitCount)
    .slice(0, 6);
}

// ────────────────── Chip → filter application ──────────────────

// Apply a list of chips as filter predicates over screenshots. The
// algorithm: AND across kinds; OR within the same kind. This matches
// the toolbar filter semantics (e.g. multi-group filter is OR'd).
export function applyChipFilters(
  screenshots: ScreenshotNode[],
  chips: EntityChip[],
): ScreenshotNode[] {
  if (chips.length === 0) return screenshots;

  // Group the chips by kind so we can OR within and AND across.
  const byKind = new Map<EntityKind, EntityChip[]>();
  for (const chip of chips) {
    const list = byKind.get(chip.kind) ?? [];
    list.push(chip);
    byKind.set(chip.kind, list);
  }

  return screenshots.filter((shot) => {
    for (const [kind, kindChips] of byKind) {
      const values = kindChips.map((chip) => chip.value);
      if (!screenshotMatchesAny(shot, kind, values)) return false;
    }
    return true;
  });
}

function screenshotMatchesAny(
  shot: ScreenshotNode,
  kind: EntityKind,
  values: string[],
): boolean {
  switch (kind) {
    case 'group':
      return shot.group != null && values.includes(shot.group);
    case 'flow': {
      const flow = getFlowLabel(shot);
      return flow != null && values.includes(flow);
    }
    case 'platform':
      return shot.platform != null && values.includes(shot.platform);
    case 'theme':
      return shot.theme != null && values.includes(shot.theme);
    case 'mobile_os':
      return shot.mobile_os != null && values.includes(shot.mobile_os);
    case 'page_type':
      return getLabelArray(shot, ['identity', 'page_types']).some((tag) => values.includes(tag));
    case 'ui_element':
      return getLabelArray(shot, ['screen_analysis', 'ui_elements']).some((tag) => values.includes(tag));
    case 'ux_pattern':
      return getLabelArray(shot, ['screen_analysis', 'ux_patterns']).some((tag) => values.includes(tag));
  }
}

// Strip stop words from a query for the text-matching stage. Run AFTER
// entity tokens have already been removed (so the remaining query is
// just the free-text portion).
export function stripStopWords(query: string): string {
  return query
    .split(/\s+/)
    .filter((token) => token.length > 0 && !isStopWord(token))
    .join(' ');
}
