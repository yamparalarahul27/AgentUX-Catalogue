import {
  ANNOTATION_EDIT_MIN_VIEWPORT_PX,
  CATALOGUE_CHIP_RECENCY_HOURS,
  CATALOGUE_CHIP_STRIP_ENABLED,
  LABELING_STUDIO_ENABLED,
  LABELING_STUDIO_MIN_VIEWPORT_PX,
  PIN_ANNOTATIONS_ENABLED,
  REFERENCE_IMAGES_ENABLED,
  REUPLOAD_ENABLED,
  TEAM_UPLOAD_ANALYTICS_ENABLED,
} from '../lib/feature-flags';

interface FlagEntry {
  name: string;
  value: boolean | number;
  type: 'boolean' | 'px' | 'hours';
  description: string;
}

// Curated list — mirrors feature-flags.ts. Descriptions paraphrased from
// the in-source comments. When you add a new flag there, add it here too.
const FLAGS: FlagEntry[] = [
  {
    name: 'PIN_ANNOTATIONS_ENABLED',
    value: PIN_ANNOTATIONS_ENABLED,
    type: 'boolean',
    description: 'Legacy click-to-place pin annotations in the lightbox. New annotations are area-drag boxes. Flip on to re-enable click-to-place.',
  },
  {
    name: 'ANNOTATION_EDIT_MIN_VIEWPORT_PX',
    value: ANNOTATION_EDIT_MIN_VIEWPORT_PX,
    type: 'px',
    description: 'Annotation editing disabled below this viewport width. Existing annotations still render read-only.',
  },
  {
    name: 'CATALOGUE_CHIP_STRIP_ENABLED',
    value: CATALOGUE_CHIP_STRIP_ENABLED,
    type: 'boolean',
    description: 'Catalogue group chip strip + hybrid toolbar. While off, the legacy Group dropdown stays in the toolbar.',
  },
  {
    name: 'CATALOGUE_CHIP_RECENCY_HOURS',
    value: CATALOGUE_CHIP_RECENCY_HOURS,
    type: 'hours',
    description: 'Recency dot threshold for the chip strip. Groups updated within this window get a fresh-activity marker.',
  },
  {
    name: 'REUPLOAD_ENABLED',
    value: REUPLOAD_ENABLED,
    type: 'boolean',
    description: 'Reupload (replace-with-fresh-file) UI. Hidden once Crop covered the common "fix this screenshot" case. Flip on if reupload becomes useful again.',
  },
  {
    name: 'TEAM_UPLOAD_ANALYTICS_ENABLED',
    value: TEAM_UPLOAD_ANALYTICS_ENABLED,
    type: 'boolean',
    description: 'Upload Analytics tab in Team Settings — date-wise upload-volume table grouped by user.',
  },
  {
    name: 'REFERENCE_IMAGES_ENABLED',
    value: REFERENCE_IMAGES_ENABLED,
    type: 'boolean',
    description: 'Reference image attachments per screenshot — the "Ref" chip on cards, reference upload UI in the inline editor, and gallery side panel. Database fields untouched while off.',
  },
  {
    name: 'LABELING_STUDIO_ENABLED',
    value: LABELING_STUDIO_ENABLED,
    type: 'boolean',
    description: 'Labelling Studio (admin-only manual labelling surface). Additionally gated by the canAdmin email check and the label_vocab migration.',
  },
  {
    name: 'LABELING_STUDIO_MIN_VIEWPORT_PX',
    value: LABELING_STUDIO_MIN_VIEWPORT_PX,
    type: 'px',
    description: 'Studio is desktop-only. Below this width the nav entry is hidden and the in-Studio resize-down swaps content for a placeholder.',
  },
];

function formatValue(entry: FlagEntry): string {
  if (entry.type === 'px') return `${entry.value} px`;
  if (entry.type === 'hours') return `${entry.value} h`;
  return entry.value ? 'ON' : 'OFF';
}

export function CatalogueFlagsSection() {
  return (
    <ul className="catalogue-team__flags-list">
      {FLAGS.map((entry) => {
        const isBoolean = entry.type === 'boolean';
        const isOn = isBoolean && entry.value === true;
        const valueClass = isBoolean
          ? `catalogue-team__flags-value catalogue-team__flags-value--${isOn ? 'on' : 'off'}`
          : 'catalogue-team__flags-value catalogue-team__flags-value--scalar';
        const typeLabel = isBoolean
          ? 'boolean'
          : entry.type === 'px'
            ? 'number (px)'
            : 'number (hours)';
        return (
          <li key={entry.name} className="catalogue-team__flags-row">
            <div className="catalogue-team__flags-head">
              <code className="catalogue-team__flags-name">{entry.name}</code>
              <span className={valueClass}>{formatValue(entry)}</span>
            </div>
            <div className="catalogue-team__flags-type">{typeLabel}</div>
            <p className="catalogue-team__flags-description">{entry.description}</p>
          </li>
        );
      })}
    </ul>
  );
}
