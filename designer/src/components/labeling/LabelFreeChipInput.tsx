import { useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  onBlur?: () => void;
}

// Free-text chip input for string[] fields with no controlled vocab
// (colors, visible_text, style_keywords, design_reference fields).
// Enter adds, Backspace on empty input removes the last chip.
export function LabelFreeChipInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
  onBlur,
}: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  function handleBlur() {
    commit();
    onBlur?.();
  }

  return (
    <div className="label-combobox label-combobox--multi label-combobox--free">
      <div className="label-combobox__chips">
        {values.map((value) => (
          <span key={value} className="label-combobox__chip">
            {value}
            <button
              type="button"
              className="label-combobox__chip-remove"
              aria-label={`Remove ${value}`}
              onClick={() => remove(value)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="label-combobox__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={values.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
