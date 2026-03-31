import { useState } from 'react';
import type { Flow } from '../types';

interface FlowAssignModalProps {
  screenshotName: string;
  currentFlowId: string | null;
  flows: Flow[];
  onAssign: (flowId: string | null) => void;
  onClose: () => void;
}

export function FlowAssignModal({
  screenshotName,
  currentFlowId,
  flows,
  onAssign,
  onClose,
}: FlowAssignModalProps) {
  const [selected, setSelected] = useState<string | null>(currentFlowId);

  return (
    <div className="flow-assign-overlay" onClick={onClose}>
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

        <div className="flow-assign-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              onAssign(selected);
              onClose();
            }}
            disabled={selected === currentFlowId}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
