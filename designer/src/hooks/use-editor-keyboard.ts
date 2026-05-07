import { useEffect } from 'react';

interface Args {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onVerify: () => void;
  onNeedsReview: () => void;
  onClose: () => void;
}

// Editor-pane keyboard shortcuts. Active only while editor is open and the
// user is not typing into an input/textarea/contenteditable element — so
// J/K/etc. don't steal letters mid-typing.
export function useEditorKeyboard({
  enabled,
  onPrev,
  onNext,
  onSaveDraft,
  onVerify,
  onNeedsReview,
  onClose,
}: Args) {
  useEffect(() => {
    if (!enabled) return;

    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditableField =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (inEditableField) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'j':
          event.preventDefault();
          onNext();
          break;
        case 'k':
          event.preventDefault();
          onPrev();
          break;
        case 's':
          event.preventDefault();
          onSaveDraft();
          break;
        case 'v':
          event.preventDefault();
          onVerify();
          break;
        case 'r':
          event.preventDefault();
          onNeedsReview();
          break;
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled, onClose, onNeedsReview, onNext, onPrev, onSaveDraft, onVerify]);
}
