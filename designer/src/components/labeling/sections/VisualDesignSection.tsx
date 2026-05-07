import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';
import { LabelVocabSinglePick } from '../LabelVocabCombobox';
import { LabelFreeChipInput } from '../LabelFreeChipInput';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
}

export function VisualDesignSection({ label, update }: Props) {
  const { visual_design: visual } = label;

  return (
    <div className="label-editor-section-body">
      <div className="label-editor-row">
        <LabelEditorField label="Theme">
          <LabelVocabSinglePick
            kind="theme"
            value={visual.theme}
            onChange={(next) =>
              update((l) => ({ ...l, visual_design: { ...l.visual_design, theme: next } }))
            }
            placeholder="light / dark…"
          />
        </LabelEditorField>
        <LabelEditorField label="Density">
          <LabelVocabSinglePick
            kind="density"
            value={visual.density}
            onChange={(next) =>
              update((l) => ({ ...l, visual_design: { ...l.visual_design, density: next } }))
            }
            placeholder="comfortable / dense…"
          />
        </LabelEditorField>
      </div>

      <LabelEditorField label="Hierarchy">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={visual.hierarchy}
          onChange={(event) =>
            update((l) => ({
              ...l,
              visual_design: { ...l.visual_design, hierarchy: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Typography notes">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={visual.typography_notes}
          onChange={(event) =>
            update((l) => ({
              ...l,
              visual_design: { ...l.visual_design, typography_notes: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Color notes">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={visual.color_notes}
          onChange={(event) =>
            update((l) => ({
              ...l,
              visual_design: { ...l.visual_design, color_notes: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Spacing notes">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={visual.spacing_notes}
          onChange={(event) =>
            update((l) => ({
              ...l,
              visual_design: { ...l.visual_design, spacing_notes: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Style keywords" hint="Free-text — Enter to add">
        <LabelFreeChipInput
          values={visual.style_keywords}
          onChange={(next) =>
            update((l) => ({
              ...l,
              visual_design: { ...l.visual_design, style_keywords: next },
            }))
          }
          placeholder="minimalist, glassy, dense…"
        />
      </LabelEditorField>
    </div>
  );
}
