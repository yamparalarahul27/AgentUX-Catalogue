interface DuplicateVariantModalProps {
  familyName: string;
  fileName: string;
  isOpen: boolean;
  variantLabel: string;
  onAddVersion: () => void;
  onCancel: () => void;
  onReplace: () => void;
}

export function CatalogueDuplicateVariantModal({
  familyName,
  fileName,
  isOpen,
  variantLabel,
  onAddVersion,
  onCancel,
  onReplace,
}: DuplicateVariantModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="flow-assign-overlay" onClick={onCancel}>
      <div
        className="flow-assign-modal catalogue-duplicate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-duplicate-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="catalogue-duplicate-modal-title">Variant already exists</h3>
        <p className="flow-assign-subtitle">
          <strong>{familyName}</strong> already has a <strong>{variantLabel}</strong> variant.
        </p>
        <p className="catalogue-duplicate-modal__copy">
          Choose how to handle <strong>{fileName}</strong>.
        </p>
        <div className="flow-assign-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-secondary" onClick={onAddVersion}>Add Version</button>
          <button type="button" className="btn-primary" onClick={onReplace}>Replace</button>
        </div>
      </div>
    </div>
  );
}
