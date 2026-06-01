import { useCallback, useEffect, useState } from 'react';

import { addBookmark, fetchBookmarkIds, removeBookmark } from '../lib/bookmarks';
import { useFeedback } from './use-feedback';

export function useBookmarks(email: string | null | undefined) {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const { fire } = useFeedback();

  useEffect(() => {
    if (!email) {
      setBookmarkedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchBookmarkIds(email).then((ids) => {
      if (!cancelled) setBookmarkedIds(ids);
    });
    return () => { cancelled = true; };
  }, [email]);

  const toggleBookmark = useCallback(async (screenshotId: string) => {
    if (!email) return { ok: false as const };
    const isBookmarked = bookmarkedIds.has(screenshotId);
    setBookmarkedIds((previous) => {
      const next = new Set(previous);
      if (isBookmarked) next.delete(screenshotId);
      else next.add(screenshotId);
      return next;
    });
    fire('save');
    const result = isBookmarked
      ? await removeBookmark(email, screenshotId)
      : await addBookmark(email, screenshotId);
    if (!result.ok) {
      setBookmarkedIds((previous) => {
        const next = new Set(previous);
        if (isBookmarked) next.add(screenshotId);
        else next.delete(screenshotId);
        return next;
      });
    }
    return result;
  }, [email, bookmarkedIds, fire]);

  return {
    bookmarkedIds,
    toggleBookmark,
  };
}
