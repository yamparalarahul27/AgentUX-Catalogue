import { useEffect, useState } from 'react';

import type { ScreenshotNode } from '../types';

// Default aspect ratios (w/h) by platform/preset. Used as the initial
// guess when we haven't yet probed the real image dimensions. Once the
// real natural width/height come in (see probeImageAspect), they
// override these.
const DEFAULT_MOBILE_IOS = 9 / 19.5;
const DEFAULT_MOBILE_ANDROID = 9 / 18.5;
const DEFAULT_WEB = 16 / 10;
const DEFAULT_UNKNOWN = 16 / 10;

export function getScreenshotAspectDefault(screenshot: ScreenshotNode | null | undefined): number {
  if (!screenshot) return DEFAULT_UNKNOWN;
  if (screenshot.platform === 'mobile') {
    if (screenshot.mobile_os === 'android') return DEFAULT_MOBILE_ANDROID;
    return DEFAULT_MOBILE_IOS;
  }
  if (screenshot.platform === 'web') return DEFAULT_WEB;
  return DEFAULT_UNKNOWN;
}

// ── Aspect probe cache ─────────────────────────────────
// Module-level so probes are shared across mounts. Subscribers re-render
// when any new aspect lands; the masonry layout is recomputed and rows
// re-justify to the real dimensions.
const aspectCache = new Map<string, number>();
const aspectListeners = new Set<() => void>();

export function getCachedAspect(url: string | null | undefined): number | undefined {
  if (!url) return undefined;
  return aspectCache.get(url);
}

export function probeImageAspect(url: string | null | undefined): void {
  if (!url) return;
  if (aspectCache.has(url)) return;
  // Reserve the slot so concurrent calls don't kick off duplicate loads.
  aspectCache.set(url, Number.NaN);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w > 0 && h > 0) {
      aspectCache.set(url, w / h);
      aspectListeners.forEach((fn) => fn());
    } else {
      aspectCache.delete(url);
    }
  };
  img.onerror = () => {
    aspectCache.delete(url);
  };
  img.src = url;
}

export function useAspectCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    aspectListeners.add(fn);
    return () => {
      aspectListeners.delete(fn);
    };
  }, []);
  return version;
}

// ── Justified-rows packing ─────────────────────────────
// Flickr / Google Photos style: every row has the same height (or the
// chosen target height when packing forces it), and within a row cells
// are scaled so their combined width exactly fills the container.
//
// Algorithm: greedy fit. Add items to a row until their combined
// width at the target height would exceed `container * tolerance`,
// then scale that row to exact `containerWidth` and start a new one.
//
// The final row gets a special "snap-to-target" treatment so that a
// short last row doesn't get stretched into a comically wide single tile.

const MIN_ROW_FILL_TOLERANCE = 0.7;

export interface MasonryItem {
  aspect: number;
}

export interface MasonryRow<T extends MasonryItem> {
  items: T[];
  height: number;
  isLast?: boolean;
}

export function layoutJustifiedRows<T extends MasonryItem>(
  items: T[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): MasonryRow<T>[] {
  if (items.length === 0 || containerWidth <= 0) return [];

  const rows: MasonryRow<T>[] = [];
  let current: T[] = [];
  let aspectSum = 0;

  for (const item of items) {
    current.push(item);
    aspectSum += item.aspect;
    const naturalWidth = aspectSum * targetRowHeight + gap * (current.length - 1);
    if (naturalWidth >= containerWidth) {
      const rowHeight = (containerWidth - gap * (current.length - 1)) / aspectSum;
      rows.push({ items: current, height: rowHeight });
      current = [];
      aspectSum = 0;
    }
  }

  if (current.length > 0) {
    // Last row: only justify if it's already close to filling.
    // Otherwise keep target height so a lonely tile doesn't stretch.
    const naturalWidth = aspectSum * targetRowHeight + gap * (current.length - 1);
    const fillRatio = naturalWidth / containerWidth;
    if (fillRatio > MIN_ROW_FILL_TOLERANCE) {
      const rowHeight = (containerWidth - gap * (current.length - 1)) / aspectSum;
      rows.push({ items: current, height: Math.min(rowHeight, targetRowHeight * 1.4), isLast: true });
    } else {
      rows.push({ items: current, height: targetRowHeight, isLast: true });
    }
  }

  return rows;
}
