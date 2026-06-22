import { supabase } from './supabase';
import { mentionLabel } from '../hooks/use-team-roster';

// Helpers for the @-mention pipeline shipped in M2. Parses mentions out
// of comment text, writes the `comment_mentions` + `notifications` rows
// for a freshly-posted comment.
//
// Companion docs:
//   - docs/mentions-and-notifications-plan.md
//   - docs/mentions-notifications-tasks-addendum.md
//
// Companion code:
//   - designer/src/components/MentionTypeahead.tsx       (M1 — produces the @s)
//   - designer/src/hooks/use-team-roster.ts             (M1 — supplies the roster)
//   - supabase/migrations/20260622_mentions_notifications_tasks.sql (M0)

// Pull every `@<local-part>` token out of comment text and resolve them
// against the team roster. Returns the resolved emails — anything that
// doesn't match a real member is dropped silently. Case-insensitive on
// the label.
//
// Why parse at submit-time instead of tracking state through the
// typeahead: the user can edit the comment text after picking a mention
// (delete the @rahul, manually type a new @sara, etc.). Re-parsing on
// submit is the simplest way to keep the recorded mentions in sync
// with what's actually in the text the recipient will read.
const MENTION_TOKEN_RE = /@([\w.+-]+)/g;

export function parseMentionsInText(text: string, roster: string[]): string[] {
  if (!text || roster.length === 0) return [];
  const labels = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    // Strip trailing punctuation: "@rahul." in "Hey @rahul." → "rahul".
    const cleaned = match[1].replace(/[.\-_]+$/, '').toLowerCase();
    if (cleaned) labels.add(cleaned);
  }
  if (labels.size === 0) return [];
  return roster.filter((email) => labels.has(mentionLabel(email).toLowerCase()));
}

export interface CommentMentionInsertArgs {
  commentKind: 'screenshot' | 'video';
  // The comment row's id (PK). For screenshot comments this is the
  // client-generated UUID also used as `screenshot_comments.id`; for
  // video comments it's the server-returned id from the insert.
  commentId: string;
  text: string;
  actorEmail: string;
  // Resolved mention emails — output of parseMentionsInText().
  mentionedEmails: string[];
  // Whether the author flagged this as a task (the "Needs action"
  // checkbox in the composer).
  needsAction: boolean;
  // Distinguishes screenshot vs video deep-link routing in M4.
  notificationSourceKind: 'screenshot_comment' | 'video_comment';
  // Deep-link payload baked into notifications.context, e.g.
  // `{ screenshot_id: '…' }` or `{ external_id: '…' }`.
  context: Record<string, unknown>;
}

// Insert mention + notification rows for a comment that just landed.
// Designed to be called *after* the comment row itself has been written
// (or enqueued for offline replay). Fire-and-forget — failures here
// don't roll back the comment.
//
// Self-mentions are filtered from notifications (we don't ping
// ourselves) but kept in comment_mentions so the chip renderer in M3
// can resolve them. The typeahead already excludes self via the
// excludeEmails prop, so seeing one here usually means the user typed
// it manually.
export async function insertCommentMentions(args: CommentMentionInsertArgs): Promise<void> {
  const {
    commentKind,
    commentId,
    text,
    actorEmail,
    mentionedEmails,
    needsAction,
    notificationSourceKind,
    context,
  } = args;

  const dedup = Array.from(new Set(mentionedEmails.map((e) => e.toLowerCase())));
  if (dedup.length === 0) return;

  const actorLower = actorEmail.toLowerCase();
  const recipients = dedup.filter((email) => email !== actorLower);

  const mentionRows = dedup.map((email) => ({
    comment_kind: commentKind,
    comment_id: commentId,
    mentioned_email: email,
    actor_email: actorEmail,
  }));

  const notificationRows = recipients.map((email) => ({
    recipient_email: email,
    actor_email: actorEmail,
    type: needsAction ? 'task' : 'mention',
    requires_action: needsAction,
    source_kind: notificationSourceKind,
    source_id: commentId,
    preview: text.slice(0, 140),
    context,
  }));

  // Parallel inserts — one failure doesn't block the other. Comment is
  // already posted, so all errors here are non-fatal; we just log them.
  const results = await Promise.allSettled([
    supabase.from('comment_mentions').insert(mentionRows),
    recipients.length > 0
      ? supabase.from('notifications').insert(notificationRows)
      : Promise.resolve({ error: null }),
  ]);

  results.forEach((res, i) => {
    const label = i === 0 ? 'comment_mentions' : 'notifications';
    if (res.status === 'rejected') {
      console.warn(`[comment-mentions] ${label} insert rejected:`, res.reason);
    } else if (res.value && 'error' in res.value && res.value.error) {
      console.warn(`[comment-mentions] ${label} insert error:`, res.value.error);
    }
  });
}
