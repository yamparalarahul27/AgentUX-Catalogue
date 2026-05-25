import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // If set, renders a "Don't show again" checkbox. The current
  // checkbox value is passed to onConfirm so the caller can persist
  // it (typically via localStorage). Omitted = checkbox not rendered.
  dontShowAgainLabel?: string;
  onConfirm: (options?: { dontShowAgain: boolean }) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  dontShowAgainLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm({ dontShowAgain });
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onConfirm, onCancel, dontShowAgain]);

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">
          <CircleAlert size={24} />
        </div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        {dontShowAgainLabel && (
          <label className="confirm-dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
            />
            <span>{dontShowAgainLabel}</span>
          </label>
        )}
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => onConfirm({ dontShowAgain })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
