import { useEffect, useRef, useState } from 'react';
import { Bookmark, X } from 'lucide-react';

import { isValidEmail } from '../lib/bookmarks';

interface BookmarkEmailModalProps {
  context: 'bookmark' | 'filter';
  initialEmail?: string | null;
  onSubmit: (email: string) => void;
  onCancel: () => void;
}

export function BookmarkEmailModal({
  context,
  initialEmail,
  onSubmit,
  onCancel,
}: BookmarkEmailModalProps) {
  const [value, setValue] = useState(initialEmail || '');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const valid = isValidEmail(value);
  const showError = touched && value.length > 0 && !valid;

  function handleSubmit() {
    setTouched(true);
    if (!valid) return;
    onSubmit(value);
  }

  const heading = context === 'bookmark'
    ? 'Save bookmarks under your email'
    : 'View your bookmarks';
  const cta = context === 'bookmark' ? 'Save bookmark' : 'Show bookmarks';

  return (
    <div className="bookmark-email-overlay" onClick={onCancel}>
      <div className="bookmark-email-modal" onClick={(event) => event.stopPropagation()}>
        <div className="bookmark-email-header">
          <span className="bookmark-email-icon" aria-hidden="true">
            <Bookmark size={18} />
          </span>
          <h3>{heading}</h3>
          <button type="button" className="bookmark-email-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="bookmark-email-body">
          <p>Bookmarks live in the catalogue under the email you provide. We'll remember it on this device so you don't have to type it again.</p>
          <input
            ref={inputRef}
            className="catalogue-filter bookmark-email-input"
            type="email"
            placeholder="you@company.com"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit();
            }}
          />
          {showError && (
            <p className="bookmark-email-error">Please enter a valid email address.</p>
          )}
        </div>
        <div className="bookmark-email-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!valid}
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
