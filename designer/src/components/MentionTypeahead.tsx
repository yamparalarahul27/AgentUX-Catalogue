import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { mentionLabel } from '../hooks/use-team-roster';

// MentionTypeahead
//
// Detects `@` at the cursor of a watched single-line input and opens a
// portal popover listing the team roster, filtered by what the user
// typed after `@`. Selecting an option replaces the `@<partial>` token
// with `@<email-local-part> ` (trailing space) and fires
// `onMentionSelected({ email })` so the composer can collect mention
// emails for the eventual `comment_mentions` insert in M2.
//
// Standalone for now — not wired into any composer yet. M2 will wrap
// the screenshot lightbox comment input and the video preview comment
// input around this component.
//
// Behaviour spec (from `docs/mentions-and-notifications-plan.md` §6.1
// and `docs/mentions-notifications-tasks-addendum.md`):
//   • `@` keystroke at cursor → open popover anchored below input
//   • Type more → filter roster (substring match on local-part)
//   • ↑ / ↓ navigate, Enter or Tab selects, Esc closes
//   • Click outside closes
//   • Backspacing through the `@` closes
//   • Whitespace between `@` and cursor closes
//   • Self-mention: NOT filtered out here — composer enforces in M2
//
// Why portal: the lightbox and video preview are modals with
// `overflow: hidden`. Without the portal the popover gets clipped at
// the modal boundary. Mirrors the IconTooltip pattern.

export interface MentionTypeaheadProps {
  // The input being watched. Either a single-line input or textarea.
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  // Current text value of the input — passed through so the typeahead
  // can read it without owning state.
  value: string;
  // Called when a mention is selected. The composer is responsible for
  // updating its own value (we hand it the next-text) and tracking the
  // list of mention emails for its eventual insert.
  onChange: (next: string) => void;
  onMentionSelected: (mention: { email: string }) => void;
  // The mentionable team roster (emails). Pass an empty array while
  // loading — the popover will show "Loading…" rather than crashing.
  roster: string[];
  // Optional: suppress the current user's own email from the list so
  // they can't self-mention. The composer knows who's logged in; the
  // typeahead does not.
  excludeEmails?: string[];
}

interface TriggerMatch {
  // Character index of the `@` in `value`.
  atIndex: number;
  // The substring after `@` up to the cursor. Used to filter the roster.
  query: string;
}

// Find the most-recent `@` before the cursor whose query (text between
// `@` and cursor) contains no whitespace. Returns null when no active
// trigger is in progress — i.e. when the typeahead should be closed.
function detectTrigger(value: string, cursor: number): TriggerMatch | null {
  if (cursor === 0) return null;
  // Walk backwards from the cursor; bail on whitespace or hitting the
  // start. The `@` itself must be either at index 0 OR preceded by
  // whitespace — `foo@bar` shouldn't trigger inside an email someone
  // is typing.
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === '@') {
      const charBefore = i === 0 ? ' ' : value[i - 1];
      if (/\s/.test(charBefore)) {
        return { atIndex: i, query: value.slice(i + 1, cursor) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

export function MentionTypeahead({
  inputRef,
  value,
  onChange,
  onMentionSelected,
  roster,
  excludeEmails,
}: MentionTypeaheadProps) {
  const [trigger, setTrigger] = useState<TriggerMatch | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const menuRef = useRef<HTMLDivElement>(null);

  // Filtered + ordered roster: substring match on the local-part (matches
  // user mental model — they're typing the label they'll see, not the
  // full email). Exact prefix matches float to the top.
  const matches = useMemo<string[]>(() => {
    if (!trigger) return [];
    const excludeSet = new Set((excludeEmails ?? []).map((e) => e.toLowerCase()));
    const queryLower = trigger.query.toLowerCase();
    const enriched = roster
      .filter((email) => !excludeSet.has(email.toLowerCase()))
      .map((email) => {
        const label = mentionLabel(email).toLowerCase();
        const includes = label.includes(queryLower);
        const startsWith = label.startsWith(queryLower);
        return { email, includes, startsWith };
      })
      .filter((entry) => entry.includes)
      .sort((a, b) => {
        if (a.startsWith && !b.startsWith) return -1;
        if (!a.startsWith && b.startsWith) return 1;
        return mentionLabel(a.email).localeCompare(mentionLabel(b.email));
      })
      .map((entry) => entry.email);
    // Cap at 8 visible — past that, the popover overwhelms the input.
    return enriched.slice(0, 8);
  }, [trigger, roster, excludeEmails]);

  // Re-detect the trigger on every keystroke. The cursor position lives
  // on the input DOM node; React doesn't trigger re-renders for caret
  // moves, so we read it on each value change.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) {
      setTrigger(null);
      return;
    }
    // `selectionStart` is null for `<input type="email">` and a few
    // other types — single-line "text" inputs and textareas always
    // return a number.
    const cursor = el.selectionStart ?? value.length;
    setTrigger(detectTrigger(value, cursor));
  }, [inputRef, value]);

  // Reset highlight when the match list changes; clamp on shrink.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [trigger?.query]);
  useEffect(() => {
    if (highlightedIndex >= matches.length) {
      setHighlightedIndex(Math.max(0, matches.length - 1));
    }
  }, [matches.length, highlightedIndex]);

  // Position the popover below the input (or above if there's no room).
  // Re-runs on open + window scroll/resize, matching the Dropdown
  // component's anchor strategy from PR #271.
  useLayoutEffect(() => {
    if (!trigger || !inputRef.current) return;
    function compute() {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const openUpward = spaceBelow < 200 && rect.top > spaceBelow;
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: Math.max(rect.width, 220),
        zIndex: 1500,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [trigger, inputRef]);

  // Click outside the popover closes it. The click that picks an option
  // is handled before this — the menu element captures it.
  useEffect(() => {
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      // Don't close if clicking back into the input — user might be
      // adjusting the caret position to refine the query.
      if (inputRef.current && inputRef.current.contains(event.target as Node)) return;
      setTrigger(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [trigger, inputRef]);

  // Keyboard nav: hooked at the document level while open so the input
  // doesn't need to know about us. The composer's own onKeyDown still
  // fires — we only call preventDefault on the keys we own.
  useEffect(() => {
    if (!trigger) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTrigger(null);
        return;
      }
      if (matches.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const selected = matches[highlightedIndex];
        if (!selected) return;
        event.preventDefault();
        // Stop the form-level Enter handler — we're picking, not
        // submitting.
        event.stopPropagation();
        selectMatch(selected);
      }
    }
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, matches, highlightedIndex]);

  function selectMatch(email: string) {
    if (!trigger) return;
    const label = mentionLabel(email);
    const before = value.slice(0, trigger.atIndex);
    const after = value.slice(trigger.atIndex + 1 + trigger.query.length);
    const insertion = `@${label} `;
    const next = before + insertion + after;
    onChange(next);
    onMentionSelected({ email });
    setTrigger(null);

    // Restore caret after the inserted mention. Has to happen after the
    // value prop updates → next microtask.
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) return;
      const caret = before.length + insertion.length;
      el.focus({ preventScroll: true });
      el.setSelectionRange(caret, caret);
    });
  }

  if (!trigger) return null;

  return createPortal(
    <div ref={menuRef} className="mention-typeahead" style={menuStyle} role="listbox">
      {matches.length === 0 ? (
        <div className="mention-typeahead__empty">No matches</div>
      ) : (
        matches.map((email, i) => {
          const label = mentionLabel(email);
          const isHighlighted = i === highlightedIndex;
          return (
            <button
              key={email}
              type="button"
              role="option"
              aria-selected={isHighlighted}
              className={`mention-typeahead__item${isHighlighted ? ' is-highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(event) => {
                // Don't blur the input before we pick the value.
                event.preventDefault();
              }}
              onClick={() => selectMatch(email)}
            >
              <span className="mention-typeahead__avatar" aria-hidden="true">
                {label.charAt(0).toUpperCase()}
              </span>
              <span className="mention-typeahead__label">{label}</span>
              <span className="mention-typeahead__email">{email}</span>
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}
