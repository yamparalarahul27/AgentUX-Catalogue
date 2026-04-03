import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Flow } from '../types';

interface FlowAssignModalProps {
  screenshotName: string;
  currentFlowId: string | null;
  flows: Flow[];
  primaryGroup?: string | null;
  screenshotGroup?: string | null;
  onAssign: (flowId: string | null) => void;
  onClose: () => void;
}

export function FlowAssignModal({
  screenshotName,
  currentFlowId,
  flows,
  primaryGroup,
  screenshotGroup,
  onAssign,
  onClose,
}: FlowAssignModalProps) {
  const isNonPrimary = primaryGroup && screenshotGroup !== primaryGroup;
  const [selected, setSelected] = useState<string | null>(currentFlowId);

  return createPortal(
    <div
      className="flow-assign-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
    >
      <div className="flow-assign-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Assign to Flow</h3>
        <p className="flow-assign-subtitle">
          Choose a flow for <strong>{screenshotName}</strong>
        </p>

        <div className="flow-assign-options">
          <label className="flow-assign-option">
            <input
              type="radio"
              name="flow"
              checked={selected === null}
              onChange={() => setSelected(null)}
            />
            <span>Unassigned</span>
          </label>
          {flows.map((f) => (
            <label key={f.id} className="flow-assign-option">
              <input
                type="radio"
                name="flow"
                checked={selected === f.id}
                onChange={() => setSelected(f.id)}
              />
              <span>{f.name}</span>
            </label>
          ))}
        </div>

        {flows.length === 0 && (
          <p className="flow-assign-empty">No flows in this project yet.</p>
        )}

        {isNonPrimary && (
          <p className="flow-assign-warning">
            Only primary group screenshots can be assigned to flows.
          </p>
        )}

        <div className="flow-assign-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              onAssign(selected);
              onClose();
            }}
            disabled={selected === currentFlowId || !!isNonPrimary}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
