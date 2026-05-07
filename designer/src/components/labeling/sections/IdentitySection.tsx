import type { ScreenshotLabel } from '../../../lib/labeling/types';
import { LabelEditorField } from '../LabelEditorField';
import { LabelVocabSinglePick, LabelVocabMultiPick } from '../LabelVocabCombobox';

interface Props {
  label: ScreenshotLabel;
  update: (mutator: (current: ScreenshotLabel) => ScreenshotLabel) => void;
}

export function IdentitySection({ label, update }: Props) {
  const { identity } = label;

  return (
    <div className="label-editor-section-body">
      <LabelEditorField label="Title" required>
        <input
          type="text"
          className="label-editor-input"
          value={identity.title}
          onChange={(event) =>
            update((l) => ({ ...l, identity: { ...l.identity, title: event.target.value } }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="One-line summary" required>
        <input
          type="text"
          className="label-editor-input"
          value={identity.one_line_summary}
          onChange={(event) =>
            update((l) => ({
              ...l,
              identity: { ...l.identity, one_line_summary: event.target.value },
            }))
          }
        />
      </LabelEditorField>

      <LabelEditorField label="Source app">
        <input
          type="text"
          className="label-editor-input"
          value={identity.source_app ?? ''}
          onChange={(event) =>
            update((l) => ({
              ...l,
              identity: { ...l.identity, source_app: event.target.value || null },
            }))
          }
          placeholder="e.g. KuCoin"
        />
      </LabelEditorField>

      <LabelEditorField label="Product category">
        <input
          type="text"
          className="label-editor-input"
          value={identity.product_category ?? ''}
          onChange={(event) =>
            update((l) => ({
              ...l,
              identity: { ...l.identity, product_category: event.target.value || null },
            }))
          }
          placeholder="e.g. Crypto trading"
        />
      </LabelEditorField>

      <LabelEditorField label="Platform" required>
        <LabelVocabSinglePick
          kind="platform"
          value={identity.platform}
          onChange={(next) =>
            update((l) => ({ ...l, identity: { ...l.identity, platform: next } }))
          }
          placeholder="Pick a platform…"
        />
      </LabelEditorField>

      <LabelEditorField label="Device type" required>
        <LabelVocabSinglePick
          kind="device_type"
          value={identity.device_type}
          onChange={(next) =>
            update((l) => ({ ...l, identity: { ...l.identity, device_type: next } }))
          }
          placeholder="Pick a device type…"
        />
      </LabelEditorField>

      <LabelEditorField label="Page types" required hint="Pick one or more">
        <LabelVocabMultiPick
          kind="page_type"
          values={identity.page_types}
          onChange={(next) =>
            update((l) => ({ ...l, identity: { ...l.identity, page_types: next } }))
          }
          placeholder="Type to search page types…"
        />
      </LabelEditorField>

      <LabelEditorField label="Screen state" required>
        <LabelVocabSinglePick
          kind="screen_state"
          value={identity.screen_state}
          onChange={(next) =>
            update((l) => ({ ...l, identity: { ...l.identity, screen_state: next } }))
          }
          placeholder="Pick a screen state…"
        />
      </LabelEditorField>
    </div>
  );
}
