import { useState } from 'react';

interface FlowInputProps {
  onInsert: (text: string) => void;
  onCancel: () => void;
}

export function FlowInput({ onInsert, onCancel }: FlowInputProps) {
  const [text, setText] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      onInsert(text.trim());
    }
  }

  return (
    <div className="flow-input-overlay" onClick={onCancel}>
      <div className="flow-input-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Flow</h3>
        <p className="flow-input-hint">
          Describe your flow using <code>-&gt;</code> to connect steps
        </p>
        <form onSubmit={handleSubmit}>
          <input
            className="flow-input-field"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Login -> Enter email -> Email OTP -> Home"
            autoFocus
          />
          <div className="flow-input-actions">
            <button type="submit" className="btn-primary" disabled={!text.trim()}>
              Insert
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
