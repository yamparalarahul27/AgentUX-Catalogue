import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  // Optional leading icon rendered before the option label in the menu.
  // Use small lucide-react icons (~13px) for consistency with the rest
  // of the catalogue toolbar.
  icon?: ReactNode;
}

interface DropdownPropsBase {
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  // Optional leading icon rendered before the trigger label. Used to
  // tag what the dropdown is filtering (Group, Flow, etc.) without
  // relying on the placeholder text alone.
  leadingIcon?: ReactNode;
  // `chips` lays the option list out as a flex-wrap cloud of pill
  // buttons instead of a vertical list. Best for bounded multi-select
  // filters (e.g. Flow); the default vertical list scales better for
  // long lists (Group, Annotation).
  variant?: 'list' | 'chips';
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
    leadingIcon,
    variant = 'list',
  } = props;
  const isMulti = props.multiple === true;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Keyboard nav cursor into the navigable item list (visible options
  // + optional Create row). The placeholder/clear row at the top is
  // not part of the navigation — users clear via mouse or by clearing
  // the field, not by arrowing up to it.
  const [highlightedIndex, setHighlightedIndex] = useState(0);
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

  // "+ Create" row appears in single-select creatable mode when the
  // search query doesn't exactly match any existing option.
  const showCreateRow = searchable && !isMulti && (props as DropdownPropsSingle).creatable === true
    && searchQuery.trim().length > 0
    && !options.some((o) => o.label.toLowerCase() === searchQuery.trim().toLowerCase());

  // Flat list of items that arrow keys + Enter can target. Order
  // matches DOM order in the menu so visual highlight tracks index.
  type NavItem = { kind: 'option'; option: DropdownOption } | { kind: 'create' };
  const navItems = useMemo<NavItem[]>(() => {
    const list: NavItem[] = visibleOptions.map((option) => ({ kind: 'option', option }));
    if (showCreateRow) list.push({ kind: 'create' });
    return list;
  }, [visibleOptions, showCreateRow]);

  // Reset highlight when the user types / opens the menu; clamp when
  // filter narrows the list below the current index.
  useEffect(() => { setHighlightedIndex(0); }, [open, searchQuery]);
  useEffect(() => {
    if (highlightedIndex >= navItems.length) {
      setHighlightedIndex(Math.max(0, navItems.length - 1));
    }
  }, [navItems.length, highlightedIndex]);

  // Scroll the highlighted item into view when arrowing past the
  // visible window of the (max-height capped) menu.
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const el = menuRef.current.querySelector('.dropdown__item--highlighted') as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

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
    // Chip-cloud menus need more horizontal room — flex-wrap looks
    // squashed at the trigger's own width. Cap at the viewport so it
    // never spills off the right edge on narrow displays.
    const baseWidth = Math.max(rect.width, 140);
    const width = variant === 'chips'
      ? Math.min(window.innerWidth - 32, Math.max(baseWidth, 480))
      : baseWidth;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width,
      maxHeight: Math.min(360, Math.max(120, availableHeight)),
      zIndex: 1400,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open, variant]);

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

  function activateNavItem(item: NavItem) {
    if (item.kind === 'option') {
      if (isMulti) {
        toggleMultiValue(item.option.value);
      } else {
        (props as DropdownPropsSingle).onChange(item.option.value);
        close();
      }
    } else {
      // create
      (props as DropdownPropsSingle).onChange(searchQuery.trim());
      close();
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (navItems.length === 0) return;
      setHighlightedIndex((i) => (i + 1) % navItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (navItems.length === 0) return;
      setHighlightedIndex((i) => (i - 1 + navItems.length) % navItems.length);
    } else if (event.key === 'Enter') {
      const item = navItems[highlightedIndex];
      if (!item) return;
      event.preventDefault();
      // Stop the form-level Enter-to-save (e.g. inline editor) — the
      // user is picking a dropdown value, not submitting the form.
      event.stopPropagation();
      activateNavItem(item);
    }
  }

  return (
    <div ref={ref} className={`dropdown ${className || ''} ${open ? 'dropdown--open' : ''} ${isMulti ? 'dropdown--multi' : ''}`}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        {leadingIcon && (
          <span className="dropdown__leading-icon" aria-hidden="true">{leadingIcon}</span>
        )}
        <span className={`dropdown__label ${triggerIsPlaceholder ? 'dropdown__label--placeholder' : ''}`}>
          {triggerLabel}
        </span>
        <ChevronDown className="dropdown__chevron" size={14} />
      </button>

      {open && !disabled && createPortal(
        <div ref={menuRef} className={`dropdown__menu ${variant === 'chips' ? 'dropdown__menu--chips' : ''}`} style={menuStyle}>
          {searchable && (
            <div className="dropdown__search">
              <input
                ref={searchRef}
                type="text"
                className="dropdown__search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
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
          {showCreateRow && (
            <button
              type="button"
              className={`dropdown__item dropdown__item--create ${highlightedIndex === visibleOptions.length ? 'dropdown__item--highlighted' : ''}`}
              onClick={() => {
                (props as DropdownPropsSingle).onChange(searchQuery.trim());
                close();
              }}
              onMouseEnter={() => setHighlightedIndex(visibleOptions.length)}
            >
              <span className="dropdown__item-main">+ Create "{searchQuery.trim()}"</span>
            </button>
          )}
          <div className={variant === 'chips' ? 'dropdown__items dropdown__items--chips' : 'dropdown__items'}>
          {visibleOptions.map((o, idx) => {
            const isSelected = isMulti
              ? selectedValues.includes(o.value)
              : o.value === (props as DropdownPropsSingle).value;
            const isHighlighted = highlightedIndex === idx;
            return (
              <button
                key={o.value}
                type="button"
                className={`dropdown__item ${isSelected ? 'dropdown__item--active' : ''} ${isHighlighted ? 'dropdown__item--highlighted' : ''}`}
                onMouseEnter={() => setHighlightedIndex(idx)}
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
                  {o.icon && (
                    <span className="dropdown__item-icon" aria-hidden="true">{o.icon}</span>
                  )}
                  <span>{o.label}</span>
                </span>
                {o.badge && <span className="dropdown__badge">{o.badge}</span>}
              </button>
            );
          })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
