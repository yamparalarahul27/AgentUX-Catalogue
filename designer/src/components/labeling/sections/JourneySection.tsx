import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function JourneySection({ label, update }: Props) {
  const { journey } = label;

  return (
    <div className="label-editor-section-body">
      <LabelEditorField label="Flow name" hint="Optional — leave blank if the screen is not part of a flow">
        <input
          type="text"
          className="label-editor-input"
          value={journey.flow_name ?? ''}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, flow_name: event.target.value || null },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Step name">
        <input
          type="text"
          className="label-editor-input"
          value={journey.step_name ?? ''}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, step_name: event.target.value || null },
            }))
          }
        />
      </LabelEditorField>

      <div className="label-editor-row">
        <LabelEditorField label="Step index">
          <input
            type="number"
            className="label-editor-input"
            value={journey.step_index ?? ''}
            onChange={(event) =>
              update((l) => ({
                ...l,
                journey: { ...l.journey, step_index: parseNumber(event.target.value) },
              }))
            }
          />
        </LabelEditorField>
        <LabelEditorField label="Screens count">
          <input
            type="number"
            className="label-editor-input"
            value={journey.screens_count ?? ''}
            onChange={(event) =>
              update((l) => ({
                ...l,
                journey: { ...l.journey, screens_count: parseNumber(event.target.value) },
              }))
            }
          />
        </LabelEditorField>
      </div>

      <LabelEditorField label="User problem">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={journey.user_problem}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, user_problem: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Step goal">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={journey.step_goal}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, step_goal: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="User action">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={journey.user_action}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, user_action: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="System response">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={journey.system_response}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, system_response: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <div className="label-editor-row">
        <LabelEditorField label="Previous step">
          <input
            type="text"
            className="label-editor-input"
            value={journey.previous_step ?? ''}
            onChange={(event) =>
              update((l) => ({
                ...l,
                journey: { ...l.journey, previous_step: event.target.value || null },
              }))
            }
          />
        </LabelEditorField>
        <LabelEditorField label="Next step">
          <input
            type="text"
            className="label-editor-input"
            value={journey.next_step ?? ''}
            onChange={(event) =>
              update((l) => ({
                ...l,
                journey: { ...l.journey, next_step: event.target.value || null },
              }))
            }
          />
        </LabelEditorField>
      </div>

      <LabelEditorField label="Inference notes" hint="Note any guesses (e.g. system_response was inferred)">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={journey.inference_notes}
          onChange={(event) =>
            update((l) => ({
              ...l,
              journey: { ...l.journey, inference_notes: event.target.value },
            }))
          }
        />
      </LabelEditorField>
    </div>
  );
}
