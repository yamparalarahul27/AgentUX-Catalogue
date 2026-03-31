import { useState, useRef, useEffect, useCallback } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
}

interface DropdownProps {
  value: string | null;
  options: DropdownOption[];
  placeholder?: string;
  onChange: (value: string | null) => void;
  className?: string;
}

export function Dropdown({ value, options, placeholder = 'Select...', onChange, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  return (
    <div ref={ref} className={`dropdown ${className || ''} ${open ? 'dropdown--open' : ''}`}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className={`dropdown__label ${!selected ? 'dropdown__label--placeholder' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="dropdown__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="dropdown__menu">
          {placeholder && (
            <button
              type="button"
              className={`dropdown__item ${value === null ? 'dropdown__item--active' : ''}`}
              onClick={() => { onChange(null); close(); }}
            >
              {placeholder}
            </button>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`dropdown__item ${o.value === value ? 'dropdown__item--active' : ''}`}
              onClick={() => { onChange(o.value); close(); }}
            >
              <span>{o.label}</span>
              {o.badge && <span className="dropdown__badge">{o.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
