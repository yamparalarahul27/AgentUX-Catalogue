import type { ReactNode } from 'react';

interface Props {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export function LabelEditorField({ label, required, hint, children }: Props) {
  return (
    <label className="label-editor-field">
      <span className="label-editor-field__label">
        {label}
        {required && <span className="label-editor-field__required" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <span className="label-editor-field__hint">{hint}</span>}
    </label>
  );
}
