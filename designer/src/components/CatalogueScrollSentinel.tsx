import { useEffect, useRef } from 'react';

interface CatalogueScrollSentinelProps {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Root margin for the IntersectionObserver; defaults to 400px so we fetch before reaching the literal end. */
  rootMargin?: string;
}

/**
 * Invisible element at the end of a paginated list. When it scrolls into
 * view (or near view via `rootMargin`), it calls `onLoadMore()` — unless
 * another fetch is already in flight or the list is exhausted.
 */
export function CatalogueScrollSentinel({
  hasMore,
  loadingMore,
  onLoadMore,
  rootMargin = '400px',
}: CatalogueScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);

  // Keep the latest callback without re-creating the observer
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    if (!hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMoreRef.current();
            break;
          }
        }
      },
      { rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, rootMargin]);

  if (!hasMore && !loadingMore) return null;

  return (
    <div className="catalogue-scroll-sentinel" aria-hidden="true" ref={sentinelRef}>
      {loadingMore && (
        <div className="catalogue-scroll-sentinel__spinner">
          <div className="loading-spinner" />
          <span>Loading more…</span>
        </div>
      )}
    </div>
  );
}
