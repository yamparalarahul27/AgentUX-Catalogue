import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';

// M3 — in-app notification bell. Reads / writes the notifications table
// from the M0 migration (docs/mentions-notifications-tasks-addendum.md).
//
// Companion code:
//   - designer/src/components/NotificationBell.tsx (UI)
//   - designer/src/lib/comment-mentions.ts (M2 — writes the rows we read)
//   - supabase/migrations/20260622_mentions_notifications_tasks.sql (M0)

export type NotificationType = 'mention' | 'task';
export type NotificationSourceKind = 'screenshot_comment' | 'video_comment';

export interface NotificationRow {
  id: string;
  recipient_email: string;
  actor_email: string | null;
  type: NotificationType;
  source_kind: NotificationSourceKind;
  source_id: string;
  preview: string | null;
  context: Record<string, unknown>;
  requires_action: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  read_at: string | null;
  created_at: string;
}

// Hard cap on rows pulled at session start — past 20 the dropdown UX
// degrades anyway (long scroll, hard to triage). Future "see all"
// surface can load more on demand.
const INITIAL_FETCH_LIMIT = 20;

// Badge formula — per the addendum's spec amendment. A row is "open" if
// it's unread OR an unresolved task. Dedup via OR (a task that's also
// unread counts once, not twice).
function isOpen(row: NotificationRow): boolean {
  return row.read_at === null || (row.requires_action && row.resolved_at === null);
}

export interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  resolveTask: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(userEmail: string | null): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Latest userEmail captured in a ref so the realtime subscription's
  // INSERT handler stays bound to the right account even if state lags.
  // Subscription itself re-binds when userEmail changes (effect dep).
  const userEmailRef = useRef(userEmail);
  useEffect(() => {
    userEmailRef.current = userEmail;
  }, [userEmail]);

  // Initial fetch — most-recent 20, ordered by created_at desc.
  const refresh = useCallback(async () => {
    if (!userEmail) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(INITIAL_FETCH_LIMIT);
    if (error) {
      console.warn('[useNotifications] fetch error:', error);
      setNotifications([]);
    } else {
      setNotifications((data ?? []) as NotificationRow[]);
    }
    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Realtime — subscribe to INSERTs of notifications addressed to this
  // user. M0 added `notifications` to the supabase_realtime publication
  // so this fires sub-second. UPDATE events deliberately not subscribed
  // for v1 (cross-tab unread sync is the only thing they'd give us, and
  // it's flagged "acceptable for v1" in the addendum risks list).
  useEffect(() => {
    if (!userEmail) return;
    const channel = supabase
      .channel(`notifications:${userEmail}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_email=eq.${userEmail}`,
        },
        (payload) => {
          // The realtime payload uses snake_case from the DB. Cast and
          // prepend — dedup by id so a manual refresh racing with the
          // realtime event doesn't double the row.
          const row = payload.new as NotificationRow;
          setNotifications((previous) => {
            if (previous.some((n) => n.id === row.id)) return previous;
            return [row, ...previous].slice(0, INITIAL_FETCH_LIMIT);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userEmail]);

  // Mark a single row read. Optimistic — flip local state first, then
  // UPDATE. RLS guarantees only the recipient can write `read_at` so
  // we don't need a recipient_email guard in the .eq() chain (the
  // policy enforces it server-side).
  const markRead = useCallback(async (id: string) => {
    const stamp = new Date().toISOString();
    setNotifications((previous) =>
      previous.map((n) => (n.id === id && n.read_at === null ? { ...n, read_at: stamp } : n)),
    );
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: stamp })
      .eq('id', id);
    if (error) {
      console.warn('[useNotifications] markRead error:', error);
    }
  }, []);

  // Bulk mark all currently-unread rows in our local list. Optimistic;
  // sends one UPDATE keyed by IDs (no SELECT round-trip needed).
  const markAllRead = useCallback(async () => {
    const stamp = new Date().toISOString();
    let ids: string[] = [];
    setNotifications((previous) => {
      ids = previous.filter((n) => n.read_at === null).map((n) => n.id);
      if (ids.length === 0) return previous;
      return previous.map((n) => (n.read_at === null ? { ...n, read_at: stamp } : n));
    });
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: stamp })
      .in('id', ids);
    if (error) {
      console.warn('[useNotifications] markAllRead error:', error);
    }
  }, []);

  // Resolve a task — sets resolved_at + resolved_by (=current user).
  // Only the recipient can resolve per RLS UPDATE policy + the spec
  // decision B-2. The button is only rendered to the recipient anyway.
  const resolveTask = useCallback(async (id: string) => {
    const stamp = new Date().toISOString();
    const email = userEmailRef.current;
    setNotifications((previous) =>
      previous.map((n) =>
        n.id === id && n.resolved_at === null
          ? { ...n, resolved_at: stamp, resolved_by: email, read_at: n.read_at ?? stamp }
          : n,
      ),
    );
    const patch: Record<string, unknown> = { resolved_at: stamp };
    if (email) patch.resolved_by = email;
    // Also stamp read_at if it's still null — resolving implies seen.
    patch.read_at = stamp;
    const { error } = await supabase
      .from('notifications')
      .update(patch)
      .eq('id', id);
    if (error) {
      console.warn('[useNotifications] resolveTask error:', error);
    }
  }, []);

  const unreadCount = useMemo(() => notifications.filter(isOpen).length, [notifications]);

  return { notifications, unreadCount, loading, markRead, markAllRead, resolveTask, refresh };
}
