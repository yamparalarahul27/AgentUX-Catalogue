import type { AppMapTheme } from './types';

/** CSS class prefix to avoid collisions with host app */
export const CSS_PREFIX = 'appmap';

/** Z-index for the floating button and modal */
export const Z_INDEX = {
  modal: 99991,
  overlay: 99992,
  floatingButton: 99993,
} as const;

/** Default position for the floating button */
export const DEFAULT_POSITION = 'bottom-right' as const;

/** Default node dimensions for layout calculation */
export const NODE_DIMENSIONS = {
  width: 260,
  height: 90,
} as const;

/** Default layout spacing */
export const LAYOUT_SPACING = {
  nodeSep: 80,
  rankSep: 120,
} as const;

/** Default theme */
export const DEFAULT_THEME: AppMapTheme = {
  accentColor: '#6366f1',
  bgColor: '#0f0f10',
  textColor: '#e4e4e7',
  nodeBgColor: '#18181b',
  nodeBorderColor: '#27272a',
  edgeColor: '#6366f1',
};

/** Route patterns to ignore during scanning */
export const IGNORED_ROUTES = [
  '_app',
  '_document',
  '_error',
  '404',
  '500',
  'layout',
  'loading',
  'error',
  'not-found',
  'template',
  'default',
] as const;

/** Common Next.js App Router special files */
export const NEXTJS_APP_SPECIAL_FILES = [
  'page',
  'layout',
  'loading',
  'error',
  'not-found',
  'template',
  'default',
  'route',
] as const;
