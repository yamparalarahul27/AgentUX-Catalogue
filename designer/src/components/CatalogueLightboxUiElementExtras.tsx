interface Props {
  // Whether the user has flipped the "Tag as UI Element" toggle on.
  tagAsUiElement: boolean;
  onToggle: () => void;
}

// Single toggle below the annotation input. When on, the save handler
// also promotes the typed label into the screenshot's UI Element list
// (the second write). No autocomplete, no near-match warning — users
// can type whatever they want; the most-recent ones show up in the
// catalogue's UI Element filter dropdown.
export function UiElementComposerExtras({ tagAsUiElement, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`catalogue-lightbox-ui-element-toggle ${tagAsUiElement ? 'is-on' : ''}`}
      onClick={onToggle}
      aria-pressed={tagAsUiElement}
    >
      <span className="catalogue-lightbox-ui-element-toggle__switch" aria-hidden="true" />
      <span className="catalogue-lightbox-ui-element-toggle__label">Tag as UI Element</span>
      <span className="catalogue-lightbox-ui-element-toggle__hint">
        {tagAsUiElement ? 'on — also adds to the filter' : 'off'}
      </span>
    </button>
  );
}
