import { normalizeUiElementName } from '../lib/labeling/promote-annotation-to-ui-element';

interface Props {
  // Whether the user has flipped the "Tag as UI Element" toggle on.
  tagAsUiElement: boolean;
  onToggle: () => void;
  // Current draft text from the annotation input — used to render the
  // "+ Create <normalized>" confirmation row when the toggle is on.
  draftText: string;
}

// Toggle + confirmation row below the annotation input. No autocomplete
// of existing UI Elements (user asked to drop that — freeform input
// only); only an inline echo of the normalized value the user is about
// to mint so they get visual confirmation before saving.
export function UiElementComposerExtras({ tagAsUiElement, onToggle, draftText }: Props) {
  const normalized = normalizeUiElementName(draftText);

  return (
    <>
      <button
        type="button"
        className={`catalogue-lightbox-ui-element-toggle ${tagAsUiElement ? 'is-on' : ''}`}
        onClick={onToggle}
        aria-pressed={tagAsUiElement}
      >
        <span className="catalogue-lightbox-ui-element-toggle__switch" aria-hidden="true" />
        <span className="catalogue-lightbox-ui-element-toggle__label">Tag as UI Element</span>
        <span className="catalogue-lightbox-ui-element-toggle__hint">
          {tagAsUiElement ? '— on' : '— off'}
        </span>
      </button>

      {tagAsUiElement && normalized && (
        <div className="catalogue-lightbox-ui-element-create" aria-live="polite">
          <span className="catalogue-lightbox-ui-element-create__plus" aria-hidden="true">+</span>
          <span className="catalogue-lightbox-ui-element-create__text">
            Create <strong>&ldquo;{normalized}&rdquo;</strong>
          </span>
        </div>
      )}
    </>
  );
}
