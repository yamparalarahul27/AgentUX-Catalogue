import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';
import type { ValidateResult } from '../../../lib/labeling/validate-label';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
  validation: ValidateResult | null;
}

const STATUS_LABEL: Record<ScreenshotLabel['review']['label_status'], string> = {
  unlabeled: 'Unlabelled',
  draft: 'Draft',
  needs_review: 'Needs review',
  verified: 'Verified',
};

export function ReviewSection({ label, update, validation }: Props) {
  const { review } = label;

  return (
    <div className="label-editor-section-body">
      <LabelEditorField label="Status">
        <span className={`label-editor-status-pill label-editor-status-pill--${review.label_status}`}>
          {STATUS_LABEL[review.label_status]}
        </span>
      </LabelEditorField>

      {validation && (
        <LabelEditorField label="Required progress">
          <div className="label-editor-progress">
            <span className="label-editor-progress__count">
              {validation.doneCount}/{validation.totalCount}
            </span>
            {validation.missing.length > 0 && (
              <ul className="label-editor-progress__missing">
                {validation.missing.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            )}
          </div>
        </LabelEditorField>
      )}

      <LabelEditorField label="Admin notes">
        <textarea
          className="label-editor-textarea"
          rows={3}
          value={review.admin_notes}
          onChange={(event) =>
            update((l) => ({
              ...l,
              review: { ...l.review, admin_notes: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <div className="label-editor-provenance">
        <h4>Provenance</h4>
        <dl>
          <dt>Source</dt>
          <dd>{review.source}</dd>
          <dt>Source email</dt>
          <dd>{review.source_email ?? '—'}</dd>
          <dt>Model</dt>
          <dd>{review.model ?? '—'}</dd>
          <dt>Prompt version</dt>
          <dd>{review.prompt_version ?? '—'}</dd>
          <dt>Vocab version</dt>
          <dd>{review.vocab_version}</dd>
          <dt>Confidence</dt>
          <dd>{review.confidence === null ? '—' : review.confidence.toFixed(2)}</dd>
        </dl>
      </div>
    </div>
  );
}
