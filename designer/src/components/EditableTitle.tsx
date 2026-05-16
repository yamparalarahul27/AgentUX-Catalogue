import { useEffect, useRef, useState } from 'react';

// EditableTitle — click-to-edit text. Shared by the lightbox header,
// stack card, and gallery view.
//
// Behaviour contract (intentionally consistent across call sites):
//   - View mode: plain text wrapped in a button so it's keyboard-
//     focusable. Click or Enter / Space enters edit mode.
//   - Edit mode: <input> autofocused, content selected.
//     - Enter         → save + exit edit
//     - Esc           → cancel + exit edit
//     - Blur (click   → save + exit edit
//       outside)
//   - Empty / whitespace-only → don't save, just exit edit and keep
//     the previous value.
//   - Unchanged       → don't fire onSave (no network round-trip).
//   - Trim before save.
//
// History: an inline-edit-on-click for the gallery title shipped early
// (commit be6f80f) and was removed on 2026-04-03 in 251e489 "Restore
// preview-first catalogue UX" because the title click was conflicting
// with "click the card to open lightbox." This restoration is scoped
// to title elements that are NOT also the lightbox-opening surface,
// so the conflict doesn't recur.

interface EditableTitleProps {
  value: string;
  // Save handler. May return a Promise; component awaits it so a busy
  // state could be added later. Errors are swallowed at the call site
  // today (parents already toast on failure).
  onSave: (next: string) => void | Promise<void>;
  // When false: render the title as plain non-interactive text (no
  // click-to-edit, no button wrapper). Used to gate the affordance
  // by capability + ownership.
  canEdit?: boolean;
  // Tag used in view mode. Edit mode is always an <input>.
  as?: 'h1' | 'h2' | 'h3' | 'span';
  className?: string;
  // Optional hint shown in the title attribute when canEdit is true.
  // Defaults to "Click to rename".
  editHint?: string;
}

export function EditableTitle({
  value,
  onSave,
  canEdit = true,
  as = 'span',
  className,
  editHint = 'Click to rename',
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against double-save when blur + Enter fire back-to-back.
  // The keydown handler triggers blur (to lose focus); the blur
  // handler is the single source of truth for committing the save.
  const savingRef = useRef(false);

  // Keep the draft in sync if the parent value changes while not
  // editing (e.g., another tab renames the family).
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  // Autofocus + select-all when entering edit mode.
  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditing]);

  function enterEdit() {
    if (!canEdit) return;
    setDraft(value);
    setIsEditing(true);
  }

  async function commit() {
    if (savingRef.current) return;
    savingRef.current = true;
    const trimmed = draft.trim();
    setIsEditing(false);
    // Restore the displayed value if the user blanked the field.
    if (trimmed.length === 0) {
      setDraft(value);
      savingRef.current = false;
      return;
    }
    if (trimmed === value) {
      savingRef.current = false;
      return;
    }
    try {
      await onSave(trimmed);
    } finally {
      savingRef.current = false;
    }
  }

  function cancel() {
    setDraft(value);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        // editable-title__input resets browser input defaults
        // (white background, system font, border, padding) so the
        // input visually matches the surrounding title text. The
        // parent's className still flows through for size/colour
        // inheritance via `font: inherit`.
        className={`editable-title__input${className ? ` ${className}` : ''}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  // View mode — render the requested tag with a button inside so the
  // title is keyboard-focusable when editable. When not editable, just
  // the plain tag with the value — no extra DOM wrapper.
  if (!canEdit) {
    return renderTag(as, className, value);
  }
  return renderTag(
    as,
    className,
    <button
      type="button"
      className="editable-title__trigger"
      onClick={enterEdit}
      title={editHint}
    >
      {value}
    </button>,
  );
}

function renderTag(
  tag: 'h1' | 'h2' | 'h3' | 'span',
  className: string | undefined,
  children: React.ReactNode,
): React.ReactElement {
  switch (tag) {
    case 'h1': return <h1 className={className}>{children}</h1>;
    case 'h2': return <h2 className={className}>{children}</h2>;
    case 'h3': return <h3 className={className}>{children}</h3>;
    default:   return <span className={className}>{children}</span>;
  }
}
