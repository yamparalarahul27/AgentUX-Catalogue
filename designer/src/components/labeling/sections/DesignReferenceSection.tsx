import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';
import { LabelFreeChipInput } from '../LabelFreeChipInput';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
}

export function DesignReferenceSection({ label, update }: Props) {
  const { design_reference: ref } = label;

  return (
    <div className="label-editor-section-body">
      <LabelEditorField label="Good for" required hint="What design problems is this a reference for? Enter to add">
        <LabelFreeChipInput
          values={ref.good_for}
          onChange={(next) =>
            update((l) => ({ ...l, design_reference: { ...l.design_reference, good_for: next } }))
          }
          placeholder="Introducing optional mode in complex product…"
        />
      </LabelEditorField>

      <LabelEditorField label="Use when designing" hint="Specific design situations to revisit this">
        <LabelFreeChipInput
          values={ref.use_when_designing}
          onChange={(next) =>
            update((l) => ({
              ...l,
              design_reference: { ...l.design_reference, use_when_designing: next },
            }))
          }
          placeholder="Feature announcement requiring user choice…"
        />
      </LabelEditorField>

      <LabelEditorField label="Patterns to steal" hint="Specific reusable design tactics shown here">
        <LabelFreeChipInput
          values={ref.patterns_to_steal}
          onChange={(next) =>
            update((l) => ({
              ...l,
              design_reference: { ...l.design_reference, patterns_to_steal: next },
            }))
          }
          placeholder="Use New/Default tags to signal recommendation…"
        />
      </LabelEditorField>

      <LabelEditorField label="Risks / anti-patterns">
        <LabelFreeChipInput
          values={ref.risks_or_anti_patterns}
          onChange={(next) =>
            update((l) => ({
              ...l,
              design_reference: { ...l.design_reference, risks_or_anti_patterns: next },
            }))
          }
          placeholder="Blocking modal interrupts time-sensitive flow…"
        />
      </LabelEditorField>

      <LabelEditorField label="Avoid using when">
        <LabelFreeChipInput
          values={ref.avoid_using_when}
          onChange={(next) =>
            update((l) => ({
              ...l,
              design_reference: { ...l.design_reference, avoid_using_when: next },
            }))
          }
          placeholder="Choice has irreversible consequences…"
        />
      </LabelEditorField>

      <LabelEditorField
        label="Similar reference queries"
        required
        hint="≥3 natural-language queries useful for retrieval — Enter to add"
      >
        <LabelFreeChipInput
          values={ref.similar_reference_queries}
          onChange={(next) =>
            update((l) => ({
              ...l,
              design_reference: { ...l.design_reference, similar_reference_queries: next },
            }))
          }
          placeholder="dark mode feature announcement modal with two option cards…"
        />
      </LabelEditorField>
    </div>
  );
}
