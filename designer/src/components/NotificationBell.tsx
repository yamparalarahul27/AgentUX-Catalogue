import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check } from 'lucide-react';

import { mentionLabel } from '../hooks/use-team-roster';
import {
  type NotificationRow,
  useNotifications,
} from '../hooks/use-notifications';
import { formatRelative } from '../lib/catalogue-relative-time';
import { IconTooltip } from './IconTooltip';

// M3 — notification bell in the catalogue header. Consumes
// `notifications` rows that M2's mention pipeline writes. Splits the
// dropdown into "Needs your action" (open tasks) and "Earlier"
// (everything else), exactly the shape specced in
// docs/mentions-notifications-tasks-addendum.md §B.3.
//
// Deep-link routing implemented in M4 — see onOpenScreenshotComment /
// onOpenVideoComment below. The bell parses each notification's
// `context` payload (written by M2) and dispatches to whichever
// handler matches. Without a handler, click only marks-read.

interface NotificationBellProps {
  userEmail: string | null;
  // M4 — deep-link callbacks. Bell reads `notification.context` and
  // dispatches: { screenshot_id } → onOpenScreenshotComment,
  // { item_key } → onOpenVideoComment.
  onOpenScreenshotComment?: (screenshotId: string, commentId: string) => void;
  onOpenVideoComment?: (itemKey: string, commentId: string) => void;
}

// Cap the count badge at "9+" — past that the badge dominates the bell
// icon and reads as noise instead of urgency.
function formatBadgeCount(n: number): string {
  if (n <= 0) return '';
  if (n >= 10) return '9+';
  return String(n);
}

function isOpenTask(row: NotificationRow): boolean {
  return row.requires_action && row.resolved_at === null;
}

export function NotificationBell({
  userEmail,
  onOpenScreenshotComment,
  onOpenVideoComment,
}: NotificationBellProps) {
  const { notifications, unreadCount, markRead, markAllRead, resolveTask } =
    useNotifications(userEmail);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // Anchor the dropdown beneath the bell, right-aligned to its trigger
  // (so it doesn't spill off the right edge of the viewport — same
  // pattern as the toolbar Dropdown from PR #271).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function compute() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = 360;
      const right = Math.max(12, window.innerWidth - rect.right);
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        right,
        width,
        maxHeight: Math.min(560, window.innerHeight - rect.bottom - 24),
        zIndex: 1500,
      });
    }
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const { openTasks, earlier } = useMemo(() => {
    const tasks: NotificationRow[] = [];
    const rest: NotificationRow[] = [];
    for (const n of notifications) {
      if (isOpenTask(n)) tasks.push(n);
      else rest.push(n);
    }
    return { openTasks: tasks, earlier: rest };
  }, [notifications]);

  if (!userEmail) return null;

  const badge = formatBadgeCount(unreadCount);
  const hasUnreadInList = notifications.some((n) => n.read_at === null);

  function handleItemClick(row: NotificationRow) {
    // M4 — dispatch to the right deep-link handler based on which
    // payload the notification carries. Parent owns the navigation
    // (lookup screenshot, switch tab, etc.); we just hand off the IDs.
    // Both fields are optional in the schema — we defensively check
    // before invoking.
    const ctx = (row.context ?? {}) as Record<string, unknown>;
    const screenshotId = typeof ctx.screenshot_id === 'string' ? ctx.screenshot_id : null;
    const itemKey = typeof ctx.item_key === 'string' ? ctx.item_key : null;
    if (row.source_kind === 'screenshot_comment' && screenshotId && onOpenScreenshotComment) {
      onOpenScreenshotComment(screenshotId, row.source_id);
    } else if (row.source_kind === 'video_comment' && itemKey && onOpenVideoComment) {
      onOpenVideoComment(itemKey, row.source_id);
    }

    // Marking-read semantics are the same as before — tasks stay
    // visible (until "Mark done"), plain mentions clear from unread.
    if (isOpenTask(row)) {
      if (row.read_at === null) void markRead(row.id);
      return;
    }
    if (row.read_at === null) void markRead(row.id);
    setOpen(false);
  }

  return (
    <>
      <IconTooltip label={badge ? `${unreadCount} unread` : 'Notifications'}>
        <button
          ref={triggerRef}
          type="button"
          className={`notification-bell__trigger${open ? ' is-open' : ''}${badge ? ' has-unread' : ''}`}
          aria-label={badge ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <Bell size={15} aria-hidden="true" />
          {badge && <span className="notification-bell__badge" aria-hidden="true">{badge}</span>}
        </button>
      </IconTooltip>

      {open && createPortal(
        <div ref={menuRef} className="notification-bell__menu" style={menuStyle} role="dialog" aria-label="Notifications">
          <header className="notification-bell__head">
            <h3>Notifications</h3>
            {hasUnreadInList && (
              <button type="button" className="notification-bell__mark-all" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            )}
          </header>

          {notifications.length === 0 ? (
            <p className="notification-bell__empty">No notifications yet.</p>
          ) : (
            <div className="notification-bell__list">
              {openTasks.length > 0 && (
                <section className="notification-bell__section">
                  <h4 className="notification-bell__section-title">
                    Needs your action <span>({openTasks.length})</span>
                  </h4>
                  {openTasks.map((row) => (
                    <NotificationItem
                      key={row.id}
                      row={row}
                      onClick={() => handleItemClick(row)}
                      onResolve={() => void resolveTask(row.id)}
                    />
                  ))}
                </section>
              )}
              {earlier.length > 0 && (
                <section className="notification-bell__section">
                  {openTasks.length > 0 && (
                    <h4 className="notification-bell__section-title">Earlier</h4>
                  )}
                  {earlier.map((row) => (
                    <NotificationItem
                      key={row.id}
                      row={row}
                      onClick={() => handleItemClick(row)}
                    />
                  ))}
                </section>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// Single notification row inside the dropdown. Renders the actor's
// avatar (initial-letter), the relationship line, a clamped preview of
// the comment text, and a relative timestamp. Task rows get a
// "Mark done" button.
interface NotificationItemProps {
  row: NotificationRow;
  onClick: () => void;
  onResolve?: () => void;
}

function NotificationItem({ row, onClick, onResolve }: NotificationItemProps) {
  const actor = row.actor_email ? mentionLabel(row.actor_email) : 'Someone';
  const isUnread = row.read_at === null;
  const isTask = isOpenTask(row);
  const relationLine = isTask
    ? `${actor} asked you to act`
    : `${actor} mentioned you`;
  const initial = actor.charAt(0).toUpperCase();
  const when = formatRelative(row.created_at) ?? '';

  // Row is a div+role rather than a <button> so the nested "Mark done"
  // can stay a real <button> (HTML disallows nested buttons).
  return (
    <div
      className={`notification-bell__item${isUnread ? ' is-unread' : ''}${isTask ? ' is-task' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className="notification-bell__avatar" aria-hidden="true">{initial}</span>
      <div className="notification-bell__item-body">
        <div className="notification-bell__item-line">
          {isUnread && <span className="notification-bell__unread-dot" aria-hidden="true" />}
          <span className="notification-bell__item-relation">{relationLine}</span>
          <span className="notification-bell__item-time">{when}</span>
        </div>
        {row.preview && (
          <p className="notification-bell__item-preview">{row.preview}</p>
        )}
        {isTask && onResolve && (
          <div className="notification-bell__item-actions">
            <button
              type="button"
              className="notification-bell__item-mark-done"
              onClick={(event) => {
                event.stopPropagation();
                onResolve();
              }}
            >
              <Check size={12} aria-hidden="true" />
              Mark done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
