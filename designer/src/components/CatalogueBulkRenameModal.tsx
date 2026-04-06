import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getScreenshotFlowLabel } from '../lib/catalogue-families';
import { buildConventionName } from '../lib/naming';

interface RenameRow {
  familyId: string;
  currentName: string;
  suggestedName: string;
  editedName: string;
}

interface CatalogueBulkRenameModalProps {
  isOpen: boolean;
  families: CatalogueFamilyView[];
  onClose: () => void;
  onRenameFamily: (familyId: string, newName: string) => Promise<void>;
}

export function CatalogueBulkRenameModal({
  isOpen,
  families,
  onClose,
  onRenameFamily,
}: CatalogueBulkRenameModalProps) {
  const [rows, setRows] = useState<RenameRow[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRows(
      families.map((family) => {
        const screenshot = family.variants[0]?.screenshot;
        const flowLabel = getScreenshotFlowLabel(screenshot ?? ({} as never)) || family.flow_label || null;
        const sequence = screenshot?.sequence ?? null;
        const suggested = buildConventionName(sequence, flowLabel, family.name);
        return {
          familyId: family.id,
          currentName: family.name,
          suggestedName: suggested,
          editedName: suggested,
        };
      }),
    );
  }, [families, isOpen]);

  const changedRows = rows.filter((row) => row.editedName.trim() && row.editedName.trim() !== row.currentName);

  async function handleApplyAll() {
    setApplying(true);
    try {
      await Promise.allSettled(
        changedRows.map((row) => onRenameFamily(row.familyId, row.editedName.trim())),
      );
      onClose();
    } finally {
      setApplying(false);
    }
  }

  function updateRow(familyId: string, editedName: string) {
    setRows((previous) => previous.map((row) => (row.familyId === familyId ? { ...row, editedName } : row)));
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className="catalogue-upload-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div
        className="catalogue-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalogue-bulk-rename-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <h3 id="catalogue-bulk-rename-title">Bulk Rename ({families.length} screenshots)</h3>
        <p className="catalogue-upload-subtitle">
          Suggested names follow the convention format. Edit as needed, then apply.
        </p>

        <div className="catalogue-bulk-rename-list">
          <div className="catalogue-bulk-rename-header">
            <span>Current Name</span>
            <span>New Name</span>
          </div>
          {rows.map((row) => (
            <div key={row.familyId} className="catalogue-bulk-rename-row">
              <span className="catalogue-bulk-rename-current">{row.currentName}</span>
              <input
                className="catalogue-filter catalogue-bulk-rename-input"
                type="text"
                value={row.editedName}
                onChange={(event) => updateRow(row.familyId, event.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="catalogue-bulk-rename-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={changedRows.length === 0 || applying}
            onClick={() => { void handleApplyAll(); }}
          >
            {applying ? 'Applying...' : `Apply ${changedRows.length} Rename${changedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
