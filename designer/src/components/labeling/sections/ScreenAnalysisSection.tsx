import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';
import { LabelVocabMultiPick } from '../LabelVocabCombobox';
import { LabelFreeChipInput } from '../LabelFreeChipInput';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
}

export function ScreenAnalysisSection({ label, update }: Props) {
  const { screen_analysis: analysis } = label;

  return (
    <div className="label-editor-section-body">
      <LabelEditorField label="Description">
        <textarea
          className="label-editor-textarea"
          rows={3}
          value={analysis.description}
          onChange={(event) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, description: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Layout">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={analysis.layout}
          onChange={(event) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, layout: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Functions">
        <textarea
          className="label-editor-textarea"
          rows={2}
          value={analysis.functions}
          onChange={(event) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, functions: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="UI elements" required hint="Pick from the controlled vocab">
        <LabelVocabMultiPick
          kind="ui_element"
          values={analysis.ui_elements}
          onChange={(next) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, ui_elements: next },
            }))
          }
          placeholder="Modal, Toast, Bottom Sheet…"
        />
      </LabelEditorField>

      <LabelEditorField label="UX patterns" required>
        <LabelVocabMultiPick
          kind="ux_pattern"
          values={analysis.ux_patterns}
          onChange={(next) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, ux_patterns: next },
            }))
          }
          placeholder="Single CTA, Comparison…"
        />
      </LabelEditorField>

      <LabelEditorField label="Colors" hint="Hex or color names — Enter to add">
        <LabelFreeChipInput
          values={analysis.colors}
          onChange={(next) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, colors: next },
            }))
          }
          placeholder="#000000, #22C55E…"
        />
      </LabelEditorField>

      <LabelEditorField label="Visible text" hint="Quoted strings of on-screen text — Enter to add">
        <LabelFreeChipInput
          values={analysis.visible_text}
          onChange={(next) =>
            update((l) => ({
              ...l,
              screen_analysis: { ...l.screen_analysis, visible_text: next },
            }))
          }
          placeholder='"Sign in", "Continue"…'
        />
      </LabelEditorField>
    </div>
  );
}
