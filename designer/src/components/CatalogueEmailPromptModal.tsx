import { useEffect, useState } from 'react';

interface CatalogueEmailPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function CatalogueEmailPromptModal({
  isOpen,
  onClose,
  onSubmit,
}: CatalogueEmailPromptModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setEmail('');
    setError('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-modal catalogue-auth-modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="confirm-title">Enter Email To Edit</h3>
        <p className="confirm-message">
          You can explore freely in read-only mode. Add your email to enable upload, edit, and delete actions.
        </p>
        <form
          className="catalogue-auth-modal__form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = email.trim().toLowerCase();
            if (!isValidEmail(trimmed)) {
              setError('Enter a valid email address.');
              return;
            }
            onSubmit(trimmed);
          }}
        >
          <input
            className="auth-input"
            type="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError('');
            }}
            placeholder="name@company.com"
          />
          {error && <p className="auth-error">{error}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Continue</button>
          </div>
        </form>
      </div>
    </div>
  );
}
