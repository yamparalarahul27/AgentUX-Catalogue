import { useState } from 'react';

interface FlowInputProps {
  onInsert: (text: string) => void;
  onCancel: () => void;
}

export function FlowInput({ onInsert, onCancel }: FlowInputProps) {
  const [text, setText] = useState('');

  function handleSubmit() {
    if (text.trim()) {
      onInsert(text.trim());
    }
  }

  return (
    <div className="flow-input-overlay" onClick={onCancel}>
      <div className="flow-input-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Flow</h3>
        <p className="flow-input-hint">
          Use <code>-&gt;</code> or <code>&gt;</code> to connect steps. One path per line — duplicate steps merge automatically.
        </p>
        <textarea
          className="flow-input-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Login > Enter email > Email OTP > Home\nLogin > Enter email > Forgot password > Reset"}
          rows={4}
          autoFocus
        />
        <div className="flow-input-actions">
          <button className="btn-primary" onClick={handleSubmit} disabled={!text.trim()}>
            Insert
          </button>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
