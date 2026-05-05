import { useCallback, useEffect, useState } from 'react';

import {
  addBookmark,
  clearBookmarkEmail,
  fetchBookmarkIds,
  getBookmarkEmail,
  removeBookmark,
  setBookmarkEmail,
} from '../lib/bookmarks';

export type BookmarkEmailModalContext =
  | { kind: 'bookmark'; screenshotId: string }
  | { kind: 'filter' }
  | null;

export function useBookmarks() {
  const [email, setEmailState] = useState<string | null>(() => getBookmarkEmail());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [emailModalContext, setEmailModalContext] = useState<BookmarkEmailModalContext>(null);

  // Load bookmarks whenever the email changes (or is set for the first time).
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

  const setEmail = useCallback((next: string) => {
    setBookmarkEmail(next);
    setEmailState(getBookmarkEmail());
  }, []);

  const clearEmail = useCallback(() => {
    clearBookmarkEmail();
    setEmailState(null);
    setBookmarkedIds(new Set());
  }, []);

  const requestBookmarkEmail = useCallback((screenshotId: string) => {
    setEmailModalContext({ kind: 'bookmark', screenshotId });
  }, []);

  const requestFilterEmail = useCallback(() => {
    setEmailModalContext({ kind: 'filter' });
  }, []);

  const closeEmailModal = useCallback(() => {
    setEmailModalContext(null);
  }, []);

  // Toggle a bookmark for a single screenshot. If no email is set, the
  // caller should already have triggered the prompt — this assumes email
  // is present.
  const toggleBookmark = useCallback(async (screenshotId: string) => {
    if (!email) return { ok: false as const };
    const isBookmarked = bookmarkedIds.has(screenshotId);
    // Optimistic update.
    setBookmarkedIds((previous) => {
      const next = new Set(previous);
      if (isBookmarked) next.delete(screenshotId);
      else next.add(screenshotId);
      return next;
    });
    const result = isBookmarked
      ? await removeBookmark(email, screenshotId)
      : await addBookmark(email, screenshotId);
    if (!result.ok) {
      // Roll back the optimistic update on failure.
      setBookmarkedIds((previous) => {
        const next = new Set(previous);
        if (isBookmarked) next.add(screenshotId);
        else next.delete(screenshotId);
        return next;
      });
    }
    return result;
  }, [email, bookmarkedIds]);

  // Save email + complete a pending bookmark in one shot. Returns ok.
  const saveEmailAndContinue = useCallback(async (input: string) => {
    setEmail(input);
    const context = emailModalContext;
    setEmailModalContext(null);
    if (context?.kind === 'bookmark') {
      // The email state update is async; do the bookmark insert directly.
      const normalized = (input || '').trim().toLowerCase();
      const result = await addBookmark(normalized, context.screenshotId);
      if (result.ok) {
        setBookmarkedIds((previous) => {
          const next = new Set(previous);
          next.add(context.screenshotId);
          return next;
        });
      }
      return result;
    }
    return { ok: true as const };
  }, [emailModalContext, setEmail]);

  return {
    email,
    bookmarkedIds,
    emailModalContext,
    setEmail,
    clearEmail,
    requestBookmarkEmail,
    requestFilterEmail,
    closeEmailModal,
    toggleBookmark,
    saveEmailAndContinue,
  };
}
