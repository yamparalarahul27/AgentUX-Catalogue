import { useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import type { ScreenshotNode } from '../../types';
import type { ScreenshotLabel } from '../../lib/labeling/types';
import { useLabelEditor } from '../../hooks/use-label-editor';
import { useEditorKeyboard } from '../../hooks/use-editor-keyboard';
import { LabelEditorSection } from './LabelEditorSection';
import { IdentitySection } from './sections/IdentitySection';
import { JourneySection } from './sections/JourneySection';
import { ScreenAnalysisSection } from './sections/ScreenAnalysisSection';
import { VisualDesignSection } from './sections/VisualDesignSection';
import { DesignReferenceSection } from './sections/DesignReferenceSection';
import { ReviewSection } from './sections/ReviewSection';

interface Props {
  screenshot: ScreenshotNode;
  userEmail: string | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onLabelPersisted: (screenshotId: string, label: ScreenshotLabel) => void;
}

const STATUS_LABEL: Record<ScreenshotLabel['review']['label_status'], string> = {
  unlabeled: 'Unlabelled',
  draft: 'Draft',
  needs_review: 'Needs review',
  verified: 'Verified',
};

const SAVE_STATUS_LABEL: Record<'idle' | 'saving' | 'saved' | 'error', string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

export function LabelEditor({
  screenshot,
  userEmail,
  onClose,
  onPrev,
  onNext,
  onLabelPersisted,
}: Props) {
  const editor = useLabelEditor({ screenshot, userEmail, onLabelPersisted });
  const { draft, update, saveDraftNow, verify, markNeedsReview, validation, saveStatus, saveError } =
    editor;

  const handleVerify = useCallback(() => {
    if (validation?.ok) verify();
  }, [validation?.ok, verify]);

  useEditorKeyboard({
    enabled: true,
    onPrev: onPrev ?? (() => undefined),
    onNext: onNext ?? (() => undefined),
    onSaveDraft: saveDraftNow,
    onVerify: handleVerify,
    onNeedsReview: markNeedsReview,
    onClose,
  });

  const status = draft?.review.label_status ?? 'unlabeled';

  const verifyDisabledReason = useMemo(() => {
    if (!validation) return null;
    if (validation.ok) return null;
    return `Missing: ${validation.missing.join(', ')}`;
  }, [validation]);

  return (
    <aside className="label-editor" role="dialog" aria-label="Edit label">
      <header className="label-editor__header">
        <div className="label-editor__heading">
          <button
            type="button"
            className="label-editor__close"
            onClick={onClose}
            aria-label="Close editor"
          >
            <X size={16} aria-hidden="true" />
          </button>
          <div className="label-editor__heading-text">
            <h2 className="label-editor__title">{draft?.identity.title || screenshot.name || 'Untitled'}</h2>
            <div className="label-editor__meta">
              <span className={`label-editor-status-pill label-editor-status-pill--${status}`}>
                {STATUS_LABEL[status]}
              </span>
              {validation && (
                <span className="label-editor__progress">
                  {validation.doneCount}/{validation.totalCount} required
                </span>
              )}
              <span
                className={`label-editor__save-status label-editor__save-status--${saveStatus}`}
                title={saveError ?? undefined}
              >
                {SAVE_STATUS_LABEL[saveStatus]}
              </span>
            </div>
          </div>
        </div>
        <div className="label-editor__nav">
          <button
            type="button"
            className="label-editor__nav-btn"
            onClick={onPrev ?? undefined}
            disabled={!onPrev}
            aria-label="Previous screenshot (K)"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="label-editor__nav-btn"
            onClick={onNext ?? undefined}
            disabled={!onNext}
            aria-label="Next screenshot (J)"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {draft && (
        <div className="label-editor__sections">
          <LabelEditorSection title="Identity" defaultOpen>
            <IdentitySection label={draft} update={update} />
          </LabelEditorSection>
          <LabelEditorSection title="Journey">
            <JourneySection label={draft} update={update} />
          </LabelEditorSection>
          <LabelEditorSection title="Screen analysis">
            <ScreenAnalysisSection label={draft} update={update} />
          </LabelEditorSection>
          <LabelEditorSection title="Visual design">
            <VisualDesignSection label={draft} update={update} />
          </LabelEditorSection>
          <LabelEditorSection title="Design reference">
            <DesignReferenceSection label={draft} update={update} />
          </LabelEditorSection>
          <LabelEditorSection title="Review">
            <ReviewSection label={draft} update={update} validation={validation} />
          </LabelEditorSection>
        </div>
      )}

      <footer className="label-editor__footer">
        <button
          type="button"
          className="label-editor__action label-editor__action--secondary"
          onClick={markNeedsReview}
          aria-label="Mark needs review (R)"
        >
          Needs review
        </button>
        <button
          type="button"
          className="label-editor__action label-editor__action--secondary"
          onClick={saveDraftNow}
          aria-label="Save draft (S)"
        >
          Save draft
        </button>
        <button
          type="button"
          className="label-editor__action label-editor__action--primary"
          onClick={handleVerify}
          disabled={!validation?.ok}
          title={verifyDisabledReason ?? 'Mark as verified (V)'}
          aria-label="Verify (V)"
        >
          Verify
        </button>
      </footer>

      <div className="label-editor__shortcuts" aria-hidden="true">
        J/K next/prev · S save · V verify · R needs review · Esc close
      </div>
    </aside>
  );
}
