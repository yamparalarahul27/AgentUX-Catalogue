import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { CatalogueFamilyView } from '../lib/catalogue-families';
import { getActiveFamilyVariant } from '../lib/catalogue-families';
import type { MobileOs, WebPreset } from '../types';

interface CatalogueFamilyListViewProps {
  activeVariantKeys: Record<string, string>;
  families: CatalogueFamilyView[];
  selected: Set<string>;
  onActiveVariantChange: (familyId: string, variantKey: string) => void;
  onChangeFamilyGroup: (familyId: string, group: string | null) => Promise<void>;
  onDeleteFamily: (familyId: string) => Promise<void>;
  onOpenPreview: (familyId: string) => void;
  onRenameFamily: (familyId: string, name: string) => Promise<void>;
  onReplaceVariantImage: (screenshotId: string, file: File) => Promise<void>;
  onToggleSelect: (familyId: string) => void;
  onUpdateVariantDetails: (
    screenshotId: string,
    patch: {
      mobile_os?: MobileOs | null;
      platform?: 'mobile' | 'web' | null;
      theme?: 'light' | 'dark' | null;
      web_preset_key?: string | null;
    },
  ) => Promise<boolean>;
  webPresets: WebPreset[];
}

const DESKTOP_RESIZE_BREAKPOINT = 1200;
const DEFAULT_COLUMN_WIDTHS = [30, 72, 240, 150, 170, 320, 110, 180];
const MIN_COLUMN_WIDTHS = [30, 72, 180, 120, 140, 220, 96, 140];
const HEADER_COLUMNS = [
  { key: 'select', label: '', resizable: false },
  { key: 'preview', label: 'Preview', resizable: true },
  { key: 'family', label: 'Screenshot', resizable: true },
  { key: 'group', label: 'Group', resizable: true },
  { key: 'flow', label: 'Flow', resizable: true },
  { key: 'variant', label: 'Variant', resizable: true },
  { key: 'created', label: 'Created', resizable: true },
  { key: 'actions', label: 'Actions', resizable: false },
] as const;

interface InlineEditDraft {
  familyId: string;
  screenshotId: string;
  familyName: string;
  groupName: string;
  theme: 'light' | 'dark' | null;
  platform: 'mobile' | 'web' | null;
  webPresetKey: string | null;
  mobileOs: MobileOs | null;
}

function buildInlineDraft(family: CatalogueFamilyView, variantKey: string | null): InlineEditDraft | null {
  const activeVariant = getActiveFamilyVariant(family, variantKey);
  const screenshot = activeVariant?.screenshot ?? null;
  if (!screenshot) return null;

  return {
    familyId: family.id,
    screenshotId: screenshot.id,
    familyName: family.name,
    groupName: family.group || '',
    theme: screenshot.theme || null,
    platform: screenshot.platform || null,
    webPresetKey: screenshot.web_preset_key || null,
    mobileOs: screenshot.mobile_os || null,
  };
}

function isInlineDraftValid(draft: InlineEditDraft | null) {
  if (!draft) return false;
  if (!draft.familyName.trim()) return false;
  if (!draft.theme) return false;
  if (draft.platform === 'web') return Boolean(draft.webPresetKey);
  if (draft.platform === 'mobile') return Boolean(draft.mobileOs);
  return false;
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function CatalogueFamilyListView({
  activeVariantKeys,
  families,
  selected,
  onActiveVariantChange,
  onChangeFamilyGroup,
  onDeleteFamily,
  onOpenPreview,
  onRenameFamily,
  onReplaceVariantImage,
  onToggleSelect,
  onUpdateVariantDetails,
  webPresets,
}: CatalogueFamilyListViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const resizeStateRef = useRef<{ index: number; startWidth: number; startX: number } | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<number[]>([...DEFAULT_COLUMN_WIDTHS]);
  const [isDesktopResizable, setIsDesktopResizable] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth > DESKTOP_RESIZE_BREAKPOINT,
  );
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<InlineEditDraft | null>(null);
  const [savingFamilyId, setSavingFamilyId] = useState<string | null>(null);

  const familyLookup = useMemo(
    () => Object.fromEntries(families.map((family) => [family.id, family])),
    [families],
  );

  const listStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isDesktopResizable) return undefined;
    return {
      '--catalogue-family-list-columns': columnWidths.map((width) => `${Math.round(width)}px`).join(' '),
    } as CSSProperties;
  }, [columnWidths, isDesktopResizable]);

  useEffect(() => {
    function handleResize() {
      setIsDesktopResizable(window.innerWidth > DESKTOP_RESIZE_BREAKPOINT);
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!editingFamilyId) return;
    const family = familyLookup[editingFamilyId];
    const nextDraft = family ? buildInlineDraft(family, activeVariantKeys[editingFamilyId] ?? null) : null;
    if (!nextDraft) {
      setEditingFamilyId(null);
      setInlineDraft(null);
      return;
    }

    setInlineDraft((previous) => {
      if (!previous) return nextDraft;
      if (previous.familyId !== nextDraft.familyId || previous.screenshotId !== nextDraft.screenshotId) {
        return nextDraft;
      }
      return previous;
    });
  }, [activeVariantKeys, editingFamilyId, familyLookup]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      if (!resizeStateRef.current) return;
      const { index, startWidth, startX } = resizeStateRef.current;
      const nextWidth = Math.max(MIN_COLUMN_WIDTHS[index] ?? 120, startWidth + (event.clientX - startX));
      setColumnWidths((previous) => previous.map((width, columnIndex) => (
        columnIndex === index ? nextWidth : width
      )));
    }

    function stopResize() {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    }

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopResize);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopResize);
    };
  }, []);

  async function requestDelete(family: CatalogueFamilyView) {
    const shouldDelete = window.confirm(`Delete screenshot "${family.name}"?`);
    if (!shouldDelete) return;
    await onDeleteFamily(family.id);
  }

  function startResize(index: number, event: React.MouseEvent<HTMLButtonElement>) {
    if (!isDesktopResizable || event.button !== 0) return;
    event.preventDefault();
    resizeStateRef.current = {
      index,
      startWidth: columnWidths[index] ?? DEFAULT_COLUMN_WIDTHS[index] ?? 160,
      startX: event.clientX,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function beginInlineEdit(family: CatalogueFamilyView) {
    const draft = buildInlineDraft(family, activeVariantKeys[family.id] ?? null);
    if (!draft) return;
    setEditingFamilyId(family.id);
    setInlineDraft(draft);
  }

  function cancelInlineEdit() {
    setEditingFamilyId(null);
    setInlineDraft(null);
  }

  function handleVariantSelect(family: CatalogueFamilyView, variantKey: string) {
    onActiveVariantChange(family.id, variantKey);
    if (editingFamilyId !== family.id) return;
    const nextDraft = buildInlineDraft(family, variantKey);
    if (nextDraft) {
      setInlineDraft(nextDraft);
    }
  }

  function handlePlatformDraftChange(platform: 'mobile' | 'web' | null) {
    setInlineDraft((previous) => {
      if (!previous) return previous;
      if (platform === 'web') {
        return {
          ...previous,
          platform,
          mobileOs: null,
          webPresetKey: previous.webPresetKey || webPresets[0]?.key || null,
        };
      }
      if (platform === 'mobile') {
        return {
          ...previous,
          platform,
          webPresetKey: null,
          mobileOs: previous.mobileOs || 'ios',
        };
      }
      return {
        ...previous,
        platform,
        webPresetKey: null,
        mobileOs: null,
      };
    });
  }

  async function saveInlineEdit(family: CatalogueFamilyView) {
    if (!inlineDraft || inlineDraft.familyId !== family.id || !isInlineDraftValid(inlineDraft)) return;
    const activeVariant = getActiveFamilyVariant(family, activeVariantKeys[family.id] ?? null);
    const screenshot = activeVariant?.screenshot ?? null;
    if (!screenshot) return;

    setSavingFamilyId(family.id);
    try {
      const trimmedName = inlineDraft.familyName.trim();
      const trimmedGroup = inlineDraft.groupName.trim();

      if (trimmedName !== family.name) {
        await onRenameFamily(family.id, trimmedName);
      }

      if (trimmedGroup !== (family.group || '')) {
        await onChangeFamilyGroup(family.id, trimmedGroup || null);
      }

      const variantChanged = (
        inlineDraft.theme !== screenshot.theme
        || inlineDraft.platform !== screenshot.platform
        || inlineDraft.webPresetKey !== screenshot.web_preset_key
        || inlineDraft.mobileOs !== screenshot.mobile_os
      );

      if (variantChanged) {
        const updated = await onUpdateVariantDetails(screenshot.id, {
          theme: inlineDraft.theme,
          platform: inlineDraft.platform,
          web_preset_key: inlineDraft.webPresetKey,
          mobile_os: inlineDraft.mobileOs,
        });
        if (!updated) return;
      }

      cancelInlineEdit();
    } finally {
      setSavingFamilyId(null);
    }
  }

  return (
    <div className="catalogue-list-view catalogue-list-view--family" style={listStyle}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTargetId) {
            void onReplaceVariantImage(replaceTargetId, file);
          }
          setReplaceTargetId(null);
          event.target.value = '';
        }}
      />

      <div className="catalogue-list-track">
        <div className="catalogue-list-header catalogue-list-header--family">
          {HEADER_COLUMNS.map((column, index) => (
            <div key={column.key} className={`catalogue-list-header-cell ${column.key === 'select' ? 'is-empty' : ''}`}>
              {column.label ? <span>{column.label}</span> : null}
              {isDesktopResizable && column.resizable ? (
                <button
                  type="button"
                  className="catalogue-list-resize-handle"
                  aria-label={`Resize ${column.label} column`}
                  onMouseDown={(event) => startResize(index, event)}
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="catalogue-list-body">
          {families.map((family) => {
            const activeVariant = getActiveFamilyVariant(family, activeVariantKeys[family.id]);
            const activeScreenshot = activeVariant?.screenshot ?? null;
            const isEditing = editingFamilyId === family.id && inlineDraft?.familyId === family.id;

            return (
              <div key={family.id} className={`catalogue-list-item ${isEditing ? 'is-editing' : ''}`}>
                <div className={`catalogue-list-row catalogue-list-row--family ${selected.has(family.id) ? 'is-selected' : ''}`}>
                  <button
                    type="button"
                    className={`catalogue-list-check ${selected.has(family.id) ? 'is-selected' : ''}`}
                    onClick={() => onToggleSelect(family.id)}
                    title="Select family"
                  >
                    {selected.has(family.id) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <button type="button" className="catalogue-list-thumb" onClick={() => onOpenPreview(family.id)}>
                    {activeScreenshot?.image_url ? (
                      <img src={activeScreenshot.image_url} alt={family.name} />
                    ) : (
                      <span className="catalogue-list-thumb-placeholder">No image</span>
                    )}
                  </button>

                  <div className="catalogue-list-name">
                    <button type="button" className="catalogue-list-name-btn" onClick={() => onOpenPreview(family.id)}>
                      {family.name}
                    </button>
                  </div>

                  <span className="catalogue-list-group">{family.group || 'No group'}</span>
                  <span className="catalogue-list-flow">
                    {family.flow_label || 'Unassigned'}
                  </span>

                  <div className="catalogue-family-list__variants">
                    {family.variants.map((variant) => (
                      <button
                        key={variant.key}
                        type="button"
                        className={`catalogue-family-card__variant ${activeVariant?.key === variant.key ? 'is-active' : ''}`}
                        onClick={() => handleVariantSelect(family, variant.key)}
                      >
                        {variant.label}
                      </button>
                    ))}
                  </div>

                  <span className="catalogue-list-created">{formatCreatedAt(activeScreenshot?.created_at || family.created_at)}</span>

                  <div className="catalogue-list-actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="catalogue-list-action is-primary"
                          onClick={() => void saveInlineEdit(family)}
                          disabled={!isInlineDraftValid(inlineDraft) || savingFamilyId === family.id}
                        >
                          {savingFamilyId === family.id ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="catalogue-list-action" onClick={cancelInlineEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="catalogue-list-action" onClick={() => beginInlineEdit(family)}>
                          Edit
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="catalogue-list-action"
                      onClick={() => {
                        const screenshot = familyLookup[family.id]
                          ? getActiveFamilyVariant(familyLookup[family.id], activeVariantKeys[family.id])?.screenshot
                          : null;
                        if (!screenshot) return;
                        setReplaceTargetId(screenshot.id);
                        fileRef.current?.click();
                      }}
                    >
                      Reupload
                    </button>
                    <button type="button" className="catalogue-list-action is-danger" onClick={() => void requestDelete(family)}>
                      Delete
                    </button>
                  </div>
                </div>

                {isEditing && inlineDraft ? (
                  <div className="catalogue-list-inline-editor">
                    <div className="catalogue-list-inline-editor__head">
                      <strong>Editing {activeVariant?.label || 'variant'}</strong>
                      <span>Changes apply to this screenshot.</span>
                    </div>

                    <div className="catalogue-list-inline-editor__grid">
                      <label className="catalogue-list-inline-editor__field">
                        <span>Screenshot name</span>
                        <input
                          type="text"
                          value={inlineDraft.familyName}
                          onChange={(event) => setInlineDraft((previous) => previous ? { ...previous, familyName: event.target.value } : previous)}
                        />
                      </label>

                      <label className="catalogue-list-inline-editor__field">
                        <span>Group</span>
                        <input
                          type="text"
                          value={inlineDraft.groupName}
                          onChange={(event) => setInlineDraft((previous) => previous ? { ...previous, groupName: event.target.value } : previous)}
                        />
                      </label>

                      <div className="catalogue-list-inline-editor__field">
                        <span>Theme</span>
                        <div className="catalogue-list-inline-editor__chips">
                          {(['light', 'dark'] as const).map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`catalogue-family-card__variant ${inlineDraft.theme === item ? 'is-active' : ''}`}
                              onClick={() => setInlineDraft((previous) => previous ? { ...previous, theme: item } : previous)}
                            >
                              {item === 'light' ? 'Light' : 'Dark'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="catalogue-list-inline-editor__field">
                        <span>Platform</span>
                        <div className="catalogue-list-inline-editor__chips">
                          {(['web', 'mobile'] as const).map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`catalogue-family-card__variant ${inlineDraft.platform === item ? 'is-active' : ''}`}
                              onClick={() => handlePlatformDraftChange(item)}
                            >
                              {item === 'web' ? 'Web' : 'Mobile'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {inlineDraft.platform === 'web' ? (
                        <div className="catalogue-list-inline-editor__field catalogue-list-inline-editor__field--full">
                          <span>Web preset</span>
                          <div className="catalogue-list-inline-editor__chips">
                            {webPresets.map((preset) => (
                              <button
                                key={preset.key}
                                type="button"
                                className={`catalogue-family-card__variant ${inlineDraft.webPresetKey === preset.key ? 'is-active' : ''}`}
                                onClick={() => setInlineDraft((previous) => previous ? { ...previous, webPresetKey: preset.key, mobileOs: null } : previous)}
                              >
                                {preset.label} {preset.width}px
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {inlineDraft.platform === 'mobile' ? (
                        <div className="catalogue-list-inline-editor__field">
                          <span>Mobile OS</span>
                          <div className="catalogue-list-inline-editor__chips">
                            {(['ios', 'android'] as const).map((item) => (
                              <button
                                key={item}
                                type="button"
                                className={`catalogue-family-card__variant ${inlineDraft.mobileOs === item ? 'is-active' : ''}`}
                                onClick={() => setInlineDraft((previous) => previous ? { ...previous, mobileOs: item, webPresetKey: null } : previous)}
                              >
                                {item === 'ios' ? 'iOS' : 'Android'}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
