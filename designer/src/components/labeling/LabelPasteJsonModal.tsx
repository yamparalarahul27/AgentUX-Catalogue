import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { parseAndDiff } from '../../lib/labeling/merge-pasted-label';
import type { ScreenshotLabel } from '../../lib/labeling/types';

const SECTION_LABEL: Record<string, string> = {
  identity: 'Identity',
  journey: 'Journey',
  screen_analysis: 'Screen analysis',
  visual_design: 'Visual design',
  design_reference: 'Design reference',
  review: 'Review',
};

interface Props {
  current: ScreenshotLabel;
  onApply: (merged: ScreenshotLabel) => void;
  onClose: () => void;
}

export function LabelPasteJsonModal({ current, onApply, onClose }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const diff = useMemo(() => parseAndDiff(text, current), [text, current]);

  const summary = diff.ok ? diff.result : null;
  const error = diff.ok ? null : diff.error;
  const hasChanges = summary && summary.changes.length > 0;

  function handleApply() {
    if (!summary || summary.changes.length === 0) return;
    onApply(summary.merged);
  }

  const sectionLines = summary
    ? (Object.entries(summary.changesBySection) as [string, number][])
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${SECTION_LABEL[key]}  ${count} field${count === 1 ? '' : 's'} will change`)
    : [];

  return createPortal(
    <div className="label-paste-modal__backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="label-paste-modal" onClick={(event) => event.stopPropagation()}>
        <header className="label-paste-modal__header">
          <h2 className="label-paste-modal__title">Paste label JSON</h2>
          <button
            type="button"
            className="label-paste-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <p className="label-paste-modal__hint">
          Click in the box below and press Cmd+V (or Ctrl+V) to paste. Unknown keys
          are ignored. Pasted &quot;verified&quot; status is saved as draft (verify manually).
        </p>

        <textarea
          ref={textareaRef}
          className="label-paste-modal__textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='{ "identity": { "title": "...", ... }, ... }'
          spellCheck={false}
        />

        <div className="label-paste-modal__preview" aria-live="polite">
          <div className="label-paste-modal__preview-title">Preview</div>
          {!text.trim() ? (
            <p className="label-paste-modal__preview-empty">Paste JSON to preview.</p>
          ) : error ? (
            <p className="label-paste-modal__preview-error">{error}</p>
          ) : !hasChanges ? (
            <p className="label-paste-modal__preview-empty">No matching fields found.</p>
          ) : (
            <>
              <ul className="label-paste-modal__preview-list">
                {sectionLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {summary?.statusDowngrade && (
                <p className="label-paste-modal__warning">
                  ⚠ Status downgrade: pasted &quot;verified&quot; saved as draft.
                </p>
              )}
              {summary && summary.typeMismatchCount > 0 && (
                <p className="label-paste-modal__warning">
                  ⚠ {summary.typeMismatchCount} field
                  {summary.typeMismatchCount === 1 ? '' : 's'} skipped (type mismatch).
                </p>
              )}
              {summary && summary.unknownTopLevelKeys.length > 0 && (
                <p className="label-paste-modal__warning">
                  ⚠ {summary.unknownTopLevelKeys.length} unknown key
                  {summary.unknownTopLevelKeys.length === 1 ? '' : 's'} ignored:{' '}
                  {summary.unknownTopLevelKeys.map((k) => `"${k}"`).join(', ')}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="label-paste-modal__footer">
          <button
            type="button"
            className="label-paste-modal__action label-paste-modal__action--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="label-paste-modal__action label-paste-modal__action--primary"
            onClick={handleApply}
            disabled={!hasChanges}
          >
            {hasChanges ? `Apply ${summary?.changes.length}` : 'Apply'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
