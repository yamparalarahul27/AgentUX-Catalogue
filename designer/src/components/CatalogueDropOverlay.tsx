import { Upload } from 'lucide-react';

export function CatalogueDropOverlay() {
  return (
    <div className="catalogue-drop-overlay" role="presentation" aria-hidden="true">
      <div className="catalogue-drop-overlay__card">
        <Upload size={36} aria-hidden="true" />
        <h3>Drop images here</h3>
        <p>Adds files to Quick Upload</p>
      </div>
    </div>
  );
}
