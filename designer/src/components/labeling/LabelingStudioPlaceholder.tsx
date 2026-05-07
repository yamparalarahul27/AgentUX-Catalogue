import { LABELING_STUDIO_MIN_VIEWPORT_PX } from '../../lib/feature-flags';

export function LabelingStudioPlaceholder() {
  return (
    <div className="labeling-studio-placeholder" role="status">
      <h2>Labelling Studio is desktop-only</h2>
      <p>
        Open on a screen at least {LABELING_STUDIO_MIN_VIEWPORT_PX} px wide to use it.
      </p>
    </div>
  );
}
