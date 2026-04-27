import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
}

interface DropdownPropsBase {
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface DropdownPropsSingle extends DropdownPropsBase {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
}

interface DropdownPropsMulti extends DropdownPropsBase {
  multiple: true;
  values: string[];
  onMultiChange: (values: string[]) => void;
}

type DropdownProps = DropdownPropsSingle | DropdownPropsMulti;

export function Dropdown(props: DropdownProps) {
  const {
    options,
    placeholder = 'Select...',
    className,
    disabled = false,
  } = props;
  const isMulti = props.multiple === true;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = !isMulti ? options.find((o) => o.value === props.value) : null;
  const selectedValues = isMulti ? props.values : [];
  const selectedLabels = isMulti
    ? options.filter((o) => selectedValues.includes(o.value)).map((o) => o.label)
    : [];

  const triggerLabel = isMulti
    ? selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
        ? `${placeholder}: ${selectedLabels[0]}`
        : `${placeholder}: ${selectedLabels.length}`
    : selected
      ? selected.label
      : placeholder;
  const triggerIsPlaceholder = isMulti ? selectedLabels.length === 0 : !selected;

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
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 140),
      maxHeight: Math.min(360, Math.max(120, availableHeight)),
      zIndex: 1400,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  function toggleMultiValue(value: string) {
    if (!isMulti) return;
    const next = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    props.onMultiChange(next);
  }

  function clearMulti() {
    if (!isMulti) return;
    props.onMultiChange([]);
    close();
  }

  return (
    <div ref={ref} className={`dropdown ${className || ''} ${open ? 'dropdown--open' : ''} ${isMulti ? 'dropdown--multi' : ''}`}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className={`dropdown__label ${triggerIsPlaceholder ? 'dropdown__label--placeholder' : ''}`}>
          {triggerLabel}
        </span>
        <svg className="dropdown__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && !disabled && createPortal(
        <div ref={menuRef} className="dropdown__menu" style={menuStyle}>
          {isMulti ? (
            <button
              type="button"
              className={`dropdown__item ${selectedValues.length === 0 ? 'dropdown__item--active' : ''}`}
              onClick={clearMulti}
            >
              {placeholder}
            </button>
          ) : (
            placeholder && (
              <button
                type="button"
                className={`dropdown__item ${props.value === null ? 'dropdown__item--active' : ''}`}
                onClick={() => { props.onChange(null); close(); }}
              >
                {placeholder}
              </button>
            )
          )}
          {options.map((o) => {
            const isSelected = isMulti
              ? selectedValues.includes(o.value)
              : o.value === (props as DropdownPropsSingle).value;
            return (
              <button
                key={o.value}
                type="button"
                className={`dropdown__item ${isSelected ? 'dropdown__item--active' : ''}`}
                onClick={() => {
                  if (isMulti) {
                    toggleMultiValue(o.value);
                  } else {
                    props.onChange(o.value);
                    close();
                  }
                }}
              >
                <span className="dropdown__item-main">
                  {isMulti && (
                    <span className={`dropdown__check ${isSelected ? 'dropdown__check--on' : ''}`} aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  )}
                  <span>{o.label}</span>
                </span>
                {o.badge && <span className="dropdown__badge">{o.badge}</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
