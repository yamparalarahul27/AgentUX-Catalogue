import { useCallback, useMemo, useState } from 'react';

import type { ScreenshotNode } from '../../types';
import type { ScreenshotLabel } from '../../lib/labeling/types';
import { useLabelEditor } from '../../hooks/use-label-editor';
import { LabelEditorSection } from './LabelEditorSection';
import { LabelPasteJsonModal } from './LabelPasteJsonModal';
import { IdentitySection } from './sections/IdentitySection';
import { JourneySection } from './sections/JourneySection';
import { ScreenAnalysisSection } from './sections/ScreenAnalysisSection';
import { VisualDesignSection } from './sections/VisualDesignSection';
import { DesignReferenceSection } from './sections/DesignReferenceSection';
import { ReviewSection } from './sections/ReviewSection';

interface Props {
  screenshot: ScreenshotNode;
  userEmail: string | null;
  onLabelPersisted?: (screenshotId: string, label: ScreenshotLabel) => void;
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

export function LabelEditor({ screenshot, userEmail, onLabelPersisted }: Props) {
  const editor = useLabelEditor({ screenshot, userEmail, onLabelPersisted });
  const { draft, update, saveDraftNow, verify, markNeedsReview, validation, saveStatus, saveError } =
    editor;
  const [pasteOpen, setPasteOpen] = useState(false);

  const handleVerify = useCallback(() => {
    if (validation?.ok) verify();
  }, [validation?.ok, verify]);

  const handlePasteApply = useCallback(
    (merged: ScreenshotLabel) => {
      update(() => merged);
      setPasteOpen(false);
    },
    [update],
  );

  const status = draft?.review.label_status ?? 'unlabeled';

  const verifyDisabledReason = useMemo(() => {
    if (!validation) return null;
    if (validation.ok) return null;
    return `Missing: ${validation.missing.join(', ')}`;
  }, [validation]);

  return (
    <div className="label-editor" role="region" aria-label="Edit label">
      <header className="label-editor__header">
        <div className="label-editor__heading-text">
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
        <button
          type="button"
          className="label-editor__paste-btn"
          onClick={() => setPasteOpen(true)}
          disabled={!draft}
          title="Paste label JSON to populate fields"
        >
          Paste JSON
        </button>
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

      {pasteOpen && draft && (
        <LabelPasteJsonModal
          current={draft}
          onApply={handlePasteApply}
          onClose={() => setPasteOpen(false)}
        />
      )}

      <footer className="label-editor__footer">
        <button
          type="button"
          className="label-editor__action label-editor__action--secondary"
          onClick={markNeedsReview}
        >
          Needs review
        </button>
        <button
          type="button"
          className="label-editor__action label-editor__action--secondary"
          onClick={saveDraftNow}
        >
          Save draft
        </button>
        <button
          type="button"
          className="label-editor__action label-editor__action--primary"
          onClick={handleVerify}
          disabled={!validation?.ok}
          title={verifyDisabledReason ?? 'Mark as verified'}
        >
          Verify
        </button>
      </footer>
    </div>
  );
}
