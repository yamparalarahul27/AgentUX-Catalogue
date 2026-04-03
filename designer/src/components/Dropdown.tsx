import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

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
  disabled?: boolean;
}

export function Dropdown({
  value,
  options,
  placeholder = 'Select...',
  onChange,
  className,
  disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) close();
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

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 260 && rect.top > spaceBelow;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 140),
      zIndex: 1400,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  return (
    <div ref={ref} className={`dropdown ${className || ''} ${open ? 'dropdown--open' : ''}`}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className={`dropdown__label ${!selected ? 'dropdown__label--placeholder' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="dropdown__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && !disabled && createPortal(
        <div ref={menuRef} className="dropdown__menu" style={menuStyle}>
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
        </div>,
        document.body,
      )}
    </div>
  );
}
