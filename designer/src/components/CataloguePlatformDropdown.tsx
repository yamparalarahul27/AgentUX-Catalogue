import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface PresetOption {
  id: string;
  label: string;
}

interface CataloguePlatformDropdownProps {
  className?: string;
  platform: 'web' | 'mobile' | null;
  webPreset: string | null;
  mobileOs: string | null;
  webPresets: PresetOption[];
  mobileOsList: PresetOption[];
  onChange: (next: { platform: 'web' | 'mobile' | null; webPreset: string | null; mobileOs: string | null }) => void;
}

type Section = 'web' | 'mobile';

export function CataloguePlatformDropdown({
  className,
  platform,
  webPreset,
  mobileOs,
  webPresets,
  mobileOsList,
  onChange,
}: CataloguePlatformDropdownProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Section | null>(platform);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) setExpanded(platform);
  }, [open, platform]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (
        ref.current && !ref.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) close();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
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
    const openUpward = spaceBelow < 320 && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove : spaceBelow;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 220),
      maxHeight: Math.min(420, Math.max(180, availableHeight)),
      zIndex: 1400,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  const presetLabel = webPresets.find((preset) => preset.id === webPreset)?.label;
  const osLabel = mobileOsList.find((item) => item.id === mobileOs)?.label;
  const triggerLabel = platform === null
    ? 'Platform'
    : platform === 'web'
      ? presetLabel ? `Platform: Web · ${presetLabel}` : 'Platform: Web'
      : osLabel ? `Platform: Mobile · ${osLabel}` : 'Platform: Mobile';
  const triggerIsPlaceholder = platform === null;

  function clearAll() {
    onChange({ platform: null, webPreset: null, mobileOs: null });
    close();
  }
  function pickWebAll() {
    onChange({ platform: 'web', webPreset: null, mobileOs: null });
    close();
  }
  function pickWebPreset(presetId: string) {
    onChange({ platform: 'web', webPreset: presetId, mobileOs: null });
    close();
  }
  function pickMobileAll() {
    onChange({ platform: 'mobile', webPreset: null, mobileOs: null });
    close();
  }
  function pickMobileOs(osId: string) {
    onChange({ platform: 'mobile', webPreset: null, mobileOs: osId });
    close();
  }
  function toggleSection(section: Section) {
    setExpanded((current) => (current === section ? null : section));
  }

  return (
    <div ref={ref} className={`dropdown ${className || ''} ${open ? 'dropdown--open' : ''}`}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`dropdown__label ${triggerIsPlaceholder ? 'dropdown__label--placeholder' : ''}`}>
          {triggerLabel}
        </span>
        <ChevronDown className="dropdown__chevron" size={14} />
      </button>

      {open && createPortal(
        <div ref={menuRef} className="dropdown__menu platform-dropdown__menu" style={menuStyle}>
          <button
            type="button"
            className={`dropdown__item ${platform === null ? 'dropdown__item--active' : ''}`}
            onClick={clearAll}
          >
            All platforms
          </button>

          <button
            type="button"
            className={`dropdown__item platform-dropdown__group-toggle ${platform === 'web' && webPreset === null ? 'dropdown__item--active' : ''}`}
            onClick={() => toggleSection('web')}
            aria-expanded={expanded === 'web'}
          >
            <span className="platform-dropdown__group-caret" aria-hidden="true">
              {expanded === 'web' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="platform-dropdown__group-label">Web</span>
          </button>
          {expanded === 'web' && (
            <div className="platform-dropdown__children">
              <button
                type="button"
                className={`dropdown__item platform-dropdown__child ${platform === 'web' && webPreset === null ? 'dropdown__item--active' : ''}`}
                onClick={pickWebAll}
              >
                All Web
              </button>
              {webPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`dropdown__item platform-dropdown__child ${platform === 'web' && webPreset === preset.id ? 'dropdown__item--active' : ''}`}
                  onClick={() => pickWebPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
              {webPresets.length === 0 && (
                <div className="dropdown__empty platform-dropdown__child">No web presets</div>
              )}
            </div>
          )}

          <button
            type="button"
            className={`dropdown__item platform-dropdown__group-toggle ${platform === 'mobile' && mobileOs === null ? 'dropdown__item--active' : ''}`}
            onClick={() => toggleSection('mobile')}
            aria-expanded={expanded === 'mobile'}
          >
            <span className="platform-dropdown__group-caret" aria-hidden="true">
              {expanded === 'mobile' ? '▾' : '▸'}
            </span>
            <span className="platform-dropdown__group-label">Mobile</span>
          </button>
          {expanded === 'mobile' && (
            <div className="platform-dropdown__children">
              <button
                type="button"
                className={`dropdown__item platform-dropdown__child ${platform === 'mobile' && mobileOs === null ? 'dropdown__item--active' : ''}`}
                onClick={pickMobileAll}
              >
                All Mobile
              </button>
              {mobileOsList.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`dropdown__item platform-dropdown__child ${platform === 'mobile' && mobileOs === item.id ? 'dropdown__item--active' : ''}`}
                  onClick={() => pickMobileOs(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
