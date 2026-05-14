import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

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
  searchable?: boolean;
  searchPlaceholder?: string;
}

interface DropdownPropsSingle extends DropdownPropsBase {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
  // When true, a "+ Create '<query>'" item appears below the matched results
  // whenever the search query doesn't match any existing option exactly.
  // Clicking it fires onChange with the raw query string. Use for free-form
  // taxonomies (group, flow) where users can introduce a new value inline.
  creatable?: boolean;
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
    searchable = false,
    searchPlaceholder = 'Search…',
  } = props;
  const isMulti = props.multiple === true;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, searchable]);

  const visibleOptions = searchable && searchQuery.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : options;

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
        <ChevronDown className="dropdown__chevron" size={14} />
      </button>

      {open && !disabled && createPortal(
        <div ref={menuRef} className="dropdown__menu" style={menuStyle}>
          {searchable && (
            <div className="dropdown__search">
              <input
                ref={searchRef}
                type="text"
                className="dropdown__search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                autoComplete="off"
              />
            </div>
          )}
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
          {searchable && visibleOptions.length === 0 && searchQuery.trim() && !(props as DropdownPropsSingle).creatable && (
            <div className="dropdown__empty">No matches</div>
          )}
          {searchable && !isMulti && (props as DropdownPropsSingle).creatable && searchQuery.trim() &&
            !options.some((o) => o.label.toLowerCase() === searchQuery.trim().toLowerCase()) && (
            <button
              type="button"
              className="dropdown__item dropdown__item--create"
              onClick={() => {
                (props as DropdownPropsSingle).onChange(searchQuery.trim());
                close();
              }}
            >
              <span className="dropdown__item-main">+ Create "{searchQuery.trim()}"</span>
            </button>
          )}
          {visibleOptions.map((o) => {
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
                      {isSelected ? <Check size={12} /> : null}
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
