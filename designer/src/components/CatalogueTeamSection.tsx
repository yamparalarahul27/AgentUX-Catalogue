import { useEffect, useMemo, useRef, useState } from 'react';

import { getScreenshotFlowLabel } from '../lib/catalogue-families';
import {
  ensureCatalogueGroupAppearanceLoaded,
  readCatalogueGroupAppearanceMap,
  removeCatalogueGroupUploadedIconFromSupabase,
  resolveCatalogueGroupAppearance,
  saveCatalogueGroupAppearanceToSupabase,
  subscribeCatalogueGroupAppearance,
  uploadCatalogueGroupIconToSupabase,
} from '../lib/catalogue-group-appearance';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import type { Project, ScreenshotNode } from '../types';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { Dropdown } from './Dropdown';

type TeamSubTab = 'analytics' | 'flows' | 'groups' | 'prototypes';

const PROTOTYPE_LINKS_KEY = 'catalogue:prototype-links';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
}

interface FlowChecklistItem {
  flow: string;
  count: number;
}

interface GroupChecklistItem {
  group: string;
  count: number;
}

interface PrototypeLink {
  id: string;
  label: string;
  url: string;
}

function buildFlowChecklist(screenshots: ScreenshotNode[]): FlowChecklistItem[] {
  const counts = new Map<string, number>();
  for (const screenshot of screenshots) {
    const flow = getScreenshotFlowLabel(screenshot);
    if (!flow) continue;
    counts.set(flow, (counts.get(flow) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([flow, count]) => ({ flow, count }))
    .sort((a, b) => b.count - a.count);
}

function buildGroupChecklist(screenshots: ScreenshotNode[]): GroupChecklistItem[] {
  const counts = new Map<string, GroupChecklistItem>();
  for (const screenshot of screenshots) {
    const group = screenshot.group?.trim();
    if (!group) continue;
    const key = group.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, { group, count: 1 });
  }

  return [...counts.values()].sort((left, right) => left.group.localeCompare(right.group));
}

function loadPrototypeLinks(): PrototypeLink[] {
  try {
    const raw = localStorage.getItem(PROTOTYPE_LINKS_KEY);
    return raw ? JSON.parse(raw) as PrototypeLink[] : [];
  } catch { return []; }
}

function savePrototypeLinks(links: PrototypeLink[]) {
  try { localStorage.setItem(PROTOTYPE_LINKS_KEY, JSON.stringify(links)); } catch { /* ignore */ }
}

export function CatalogueTeamSection({ projects, screenshots }: CatalogueTeamSectionProps) {
  const [subTab, setSubTab] = useState<TeamSubTab>('analytics');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [protoLinks, setProtoLinks] = useState<PrototypeLink[]>(loadPrototypeLinks);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [groupAppearanceMap, setGroupAppearanceMap] = useState(readCatalogueGroupAppearanceMap);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [groupLabelDraft, setGroupLabelDraft] = useState('');
  const [groupIconEmojiDraft, setGroupIconEmojiDraft] = useState('');
  const [groupIconStoragePathDraft, setGroupIconStoragePathDraft] = useState('');
  const [groupIconUrlDraft, setGroupIconUrlDraft] = useState('');
  const [groupSaveMessage, setGroupSaveMessage] = useState<string | null>(null);
  const [isSavingGroupAppearance, setIsSavingGroupAppearance] = useState(false);
  const [isUploadingGroupIcon, setIsUploadingGroupIcon] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );

  const projectOptions = useMemo(
    () => projects
      .map((project) => ({ label: project.name, value: project.id }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [projects],
  );

  const scopedScreenshots = useMemo(
    () => (projectId ? screenshots.filter((screenshot) => screenshot.project_id === projectId) : screenshots),
    [projectId, screenshots],
  );

  const rows = useMemo(
    () => buildTeamUploadAnalyticsRows(scopedScreenshots, null),
    [scopedScreenshots],
  );

  const flowChecklist = useMemo(() => buildFlowChecklist(scopedScreenshots), [scopedScreenshots]);
  const groupChecklist = useMemo(() => buildGroupChecklist(scopedScreenshots), [scopedScreenshots]);

  useEffect(() => {
    const unsubscribe = subscribeCatalogueGroupAppearance(() => {
      setGroupAppearanceMap(readCatalogueGroupAppearanceMap());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void ensureCatalogueGroupAppearanceLoaded(projectId);
  }, [projectId]);

  function addPrototypeLink() {
    const url = newUrl.trim();
    const label = newLabel.trim() || url;
    if (!url) return;
    const link: PrototypeLink = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, url };
    const next = [...protoLinks, link];
    setProtoLinks(next);
    savePrototypeLinks(next);
    setNewLabel('');
    setNewUrl('');
  }

  function removePrototypeLink(id: string) {
    const next = protoLinks.filter((link) => link.id !== id);
    setProtoLinks(next);
    savePrototypeLinks(next);
  }

  function beginGroupEdit(group: string) {
    if (!projectId) {
      setGroupSaveMessage('Select a project before editing group names or icons.');
      return;
    }
    const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, group, projectId);
    setEditingGroupKey(group.toLowerCase());
    setGroupLabelDraft(appearance.label || group);
    setGroupIconEmojiDraft(appearance.iconEmoji || '');
    setGroupIconStoragePathDraft(appearance.iconStoragePath || '');
    setGroupIconUrlDraft(appearance.iconUrl || '');
    setGroupSaveMessage(null);
  }

  function cancelGroupEdit() {
    setEditingGroupKey(null);
    setGroupLabelDraft('');
    setGroupIconEmojiDraft('');
    setGroupIconStoragePathDraft('');
    setGroupIconUrlDraft('');
  }

  async function saveGroupAppearance(group: string) {
    setIsSavingGroupAppearance(true);
    setGroupSaveMessage(null);
    try {
      const result = await saveCatalogueGroupAppearanceToSupabase({
        group,
        iconEmoji: groupIconEmojiDraft,
        iconStoragePath: groupIconStoragePathDraft || null,
        iconUrl: groupIconUrlDraft || null,
        label: groupLabelDraft,
        projectId,
      });

      if (!result.ok) {
        setGroupSaveMessage(result.error);
        return;
      }

      setGroupSaveMessage('Group appearance saved.');
      cancelGroupEdit();
    } finally {
      setIsSavingGroupAppearance(false);
    }
  }

  async function handleGroupIconUpload(group: string, file: File | null) {
    if (!file) return;
    setIsUploadingGroupIcon(true);
    setGroupSaveMessage(null);
    try {
      const result = await uploadCatalogueGroupIconToSupabase({
        file,
        group,
        iconEmoji: groupIconEmojiDraft,
        label: groupLabelDraft,
        projectId,
      });

      if (!result.ok) {
        setGroupSaveMessage(result.error);
        return;
      }

      setGroupIconUrlDraft(result.iconUrl);
      setGroupIconStoragePathDraft(result.iconStoragePath);
      setGroupSaveMessage('Icon uploaded.');
    } finally {
      setIsUploadingGroupIcon(false);
    }
  }

  async function handleRemoveUploadedIcon(group: string) {
    setGroupSaveMessage(null);
    const result = await removeCatalogueGroupUploadedIconFromSupabase({
      group,
      iconEmoji: groupIconEmojiDraft,
      label: groupLabelDraft,
      projectId,
    });

    if (!result.ok) {
      setGroupSaveMessage(result.error);
      return;
    }

    setGroupIconUrlDraft('');
    setGroupIconStoragePathDraft('');
    setGroupSaveMessage('Uploaded icon removed.');
  }

  return (
    <section className="catalogue-team">
      <div className="catalogue-team__head">
        <div className="catalogue-team__copy">
          <div className="catalogue-team__sub-tabs">
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'analytics' ? 'is-active' : ''}`} onClick={() => setSubTab('analytics')}>
              Upload Analytics
            </button>
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'flows' ? 'is-active' : ''}`} onClick={() => setSubTab('flows')}>
              Flows
            </button>
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'groups' ? 'is-active' : ''}`} onClick={() => setSubTab('groups')}>
              Groups
            </button>
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'prototypes' ? 'is-active' : ''}`} onClick={() => setSubTab('prototypes')}>
              Figma Prototypes
            </button>
          </div>
          {subTab === 'analytics' && <p>Date-wise screenshot uploads grouped in IST with Web and Mobile split.</p>}
          {subTab === 'flows' && <p>All flows from uploaded screenshots. {flowChecklist.length} flow{flowChecklist.length !== 1 ? 's' : ''} tracked.</p>}
          {subTab === 'groups' && <p>All groups used in uploaded screenshots. {groupChecklist.length} group{groupChecklist.length !== 1 ? 's' : ''} found.</p>}
          {subTab === 'prototypes' && <p>Figma prototype links for quick access. {protoLinks.length} link{protoLinks.length !== 1 ? 's' : ''} saved.</p>}
        </div>
        {subTab !== 'prototypes' && (
          <div className="catalogue-team__filters">
            <Dropdown
              value={projectId}
              options={projectOptions}
              placeholder={selectedProject ? selectedProject.name : 'All projects'}
              onChange={setProjectId}
              className="catalogue-team__project-dropdown"
            />
          </div>
        )}
      </div>

      {subTab === 'analytics' && (
        <>
          {rows.length === 0 ? (
            <div className="catalogue-team__empty">No upload data available for the selected scope.</div>
          ) : (
            <div className="catalogue-team__table-wrap">
              <table className="catalogue-team__table">
                <thead>
                  <tr><th>Date (IST)</th><th>User</th><th>Web</th><th>Mobile</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.date}\u0000${row.userEmail}`}>
                      <td>{formatTeamAnalyticsDate(row.date)}</td>
                      <td>{row.userEmail}</td>
                      <td>{row.webCount}</td>
                      <td>{row.mobileCount}</td>
                      <td>{row.totalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subTab === 'flows' && (
        <>
          {flowChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No flows found. Upload screenshots with flow labels to populate this list.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {flowChecklist.map((item) => (
                <div key={item.flow} className="catalogue-team__checklist-item">
                  <span className="catalogue-team__checklist-flow">{item.flow}</span>
                  <span className="catalogue-team__checklist-count">{item.count} screenshot{item.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'groups' && (
        <>
          {!projectId && (
            <div className="catalogue-team__group-note">
              Select a project to edit group name and icon.
            </div>
          )}
          {groupSaveMessage && (
            <div className="catalogue-team__group-note">
              {groupSaveMessage}
            </div>
          )}
          {groupChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No groups found yet. Add or rename screenshot groups to populate this list.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {groupChecklist.map((item) => {
                const isEditing = editingGroupKey === item.group.toLowerCase();

                return (
                  <div key={item.group.toLowerCase()} className="catalogue-team__checklist-item catalogue-team__checklist-item--group">
                    <div className="catalogue-team__group-meta">
                      <CatalogueGroupLabel
                        className="catalogue-team__checklist-flow"
                        group={item.group}
                        projectId={projectId}
                      />
                      <span className="catalogue-team__checklist-count">{item.count} screenshot{item.count !== 1 ? 's' : ''}</span>
                    </div>
                    {isEditing ? (
                      <div className="catalogue-team__group-editor">
                        <input
                          ref={iconFileInputRef}
                          className="catalogue-team__group-icon-file"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          onChange={(event) => {
                            void handleGroupIconUpload(item.group, event.target.files?.[0] || null);
                            event.target.value = '';
                          }}
                        />
                        <input
                          className="catalogue-filter"
                          type="text"
                          placeholder="Group display name"
                          value={groupLabelDraft}
                          onChange={(event) => setGroupLabelDraft(event.target.value)}
                        />
                        <input
                          className="catalogue-filter catalogue-team__group-icon-input"
                          type="text"
                          placeholder="Emoji (optional)"
                          value={groupIconEmojiDraft}
                          onChange={(event) => setGroupIconEmojiDraft(event.target.value)}
                        />
                        {groupIconUrlDraft && (
                          <div className="catalogue-team__group-icon-preview">
                            <img src={groupIconUrlDraft} alt="" aria-hidden="true" />
                            <span>Uploaded icon</span>
                          </div>
                        )}
                        <div className="catalogue-team__group-editor-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={isUploadingGroupIcon || !projectId}
                            onClick={() => iconFileInputRef.current?.click()}
                          >
                            {isUploadingGroupIcon ? 'Uploading...' : 'Upload Icon'}
                          </button>
                          {groupIconStoragePathDraft && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={isUploadingGroupIcon || isSavingGroupAppearance || !projectId}
                              onClick={() => { void handleRemoveUploadedIcon(item.group); }}
                            >
                              Remove Uploaded Icon
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={isSavingGroupAppearance || isUploadingGroupIcon || !projectId}
                            onClick={() => { void saveGroupAppearance(item.group); }}
                          >
                            {isSavingGroupAppearance ? 'Saving...' : 'Save'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={cancelGroupEdit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="catalogue-team__group-edit-btn"
                        disabled={!projectId}
                        onClick={() => beginGroupEdit(item.group)}
                      >
                        Edit Name & Icon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'prototypes' && (
        <>
          <div className="catalogue-team__proto-form">
            <input
              className="catalogue-filter"
              type="text"
              placeholder="Label (e.g. Deposit Flow v2)"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
            />
            <input
              className="catalogue-filter"
              type="url"
              placeholder="Figma prototype URL"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') addPrototypeLink(); }}
            />
            <button type="button" className="btn-primary" disabled={!newUrl.trim()} onClick={addPrototypeLink}>
              Add Link
            </button>
          </div>

          {protoLinks.length === 0 ? (
            <div className="catalogue-team__empty">No prototype links yet. Add a Figma URL above.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {protoLinks.map((link) => (
                <div key={link.id} className="catalogue-team__checklist-item">
                  <a
                    className="catalogue-team__proto-link"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    {link.label}
                  </a>
                  <button
                    type="button"
                    className="catalogue-team__proto-remove"
                    title="Remove link"
                    onClick={() => removePrototypeLink(link.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
