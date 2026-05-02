import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';

import { getScreenshotFlowLabel } from '../lib/catalogue-families';
import {
  ensureCatalogueGroupAppearanceLoaded,
  ensureCatalogueGroupAppearanceLoadedForProjects,
  readCatalogueGroupAppearanceMap,
  removeCatalogueGroupUploadedIconFromSupabase,
  resolveCatalogueGroupAppearance,
  saveCatalogueGroupAppearanceToSupabase,
  subscribeCatalogueGroupAppearance,
  uploadCatalogueGroupIconToSupabase,
} from '../lib/catalogue-group-appearance';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import { TEAM_UPLOAD_ANALYTICS_ENABLED } from '../lib/feature-flags';
import type { Project, ScreenshotNode } from '../types';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { ConfirmModal } from './ConfirmModal';
import { GroupAppearanceEditModal } from './GroupAppearanceEditModal';

type TeamSubTab = 'analytics' | 'flows' | 'groups';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
  // When provided, saving a group editor with a changed name will also
  // rename every underlying `screenshots.group` row whose casing matches
  // any of `oldNames`. The Team checklist groups by lowercase canonical,
  // so the source list catches all DB variants under one click.
  onRenameGroupKey?: (
    projectId: string,
    oldNames: string[],
    newName: string,
  ) => Promise<{ ok: boolean; updatedCount: number; error?: string }>;
}

interface FlowChecklistItem {
  flow: string;
  count: number;
}

interface GroupChecklistItem {
  group: string;
  count: number;
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

export function CatalogueTeamSection({ projects, screenshots, onRenameGroupKey }: CatalogueTeamSectionProps) {
  const [subTab, setSubTab] = useState<TeamSubTab>(TEAM_UPLOAD_ANALYTICS_ENABLED ? 'analytics' : 'flows');
  // The project picker has been removed — single-project workflow. Default
  // to the first project's id (or null if none) so per-project appearance
  // logic still works. Multi-project filtering is no longer surfaced.
  const projectId = projects[0]?.id ?? null;
  const [groupAppearanceMap, setGroupAppearanceMap] = useState(readCatalogueGroupAppearanceMap);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingGroupOriginal, setEditingGroupOriginal] = useState<string>('');
  const [groupLabelDraft, setGroupLabelDraft] = useState('');
  const [groupIconStoragePathDraft, setGroupIconStoragePathDraft] = useState('');
  const [groupIconUrlDraft, setGroupIconUrlDraft] = useState('');
  const [groupSaveMessage, setGroupSaveMessage] = useState<string | null>(null);
  const [isSavingGroupAppearance, setIsSavingGroupAppearance] = useState(false);
  const [isUploadingGroupIcon, setIsUploadingGroupIcon] = useState(false);
  const [renameConfirm, setRenameConfirm] = useState<{ group: string; newName: string; count: number; sourceCasings: string[] } | null>(null);

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
    if (projectId) {
      void ensureCatalogueGroupAppearanceLoaded(projectId);
      return;
    }

    void ensureCatalogueGroupAppearanceLoadedForProjects(projects.map((project) => project.id));
  }, [projectId, projects]);

  function getAppearanceScope() {
    if (projectId) {
      return { projectId };
    }
    return { projectIds: projects.map((project) => project.id) };
  }

  function beginGroupEdit(group: string) {
    const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, group, projectId);
    setEditingGroupKey(group.toLowerCase());
    setEditingGroupOriginal(group);
    setGroupLabelDraft(appearance.label || group);
    setGroupIconStoragePathDraft(appearance.iconStoragePath || '');
    setGroupIconUrlDraft(appearance.iconUrl || '');
    setGroupSaveMessage(null);
  }

  function cancelGroupEdit() {
    setEditingGroupKey(null);
    setEditingGroupOriginal('');
    setGroupLabelDraft('');
    setGroupIconStoragePathDraft('');
    setGroupIconUrlDraft('');
  }

  // Saves the group appearance row (display label + icon). Pure cosmetic.
  // Called after the rename DB write succeeds (or directly when no rename
  // is needed).
  async function saveAppearanceForGroup(group: string) {
    const result = await saveCatalogueGroupAppearanceToSupabase({
      group,
      iconStoragePath: groupIconStoragePathDraft || null,
      iconUrl: groupIconUrlDraft || null,
      label: groupLabelDraft,
      ...getAppearanceScope(),
    });
    return result;
  }

  // Save handler. If the editor's name draft differs from the original
  // canonical key (case-insensitive), surface a confirm dialog before
  // doing the project-wide rename + appearance save. The rename catches
  // every DB casing under that canonical (e.g. "Coinbase" + "coinbase").
  async function saveGroupAppearance(group: string) {
    setGroupSaveMessage(null);
    const trimmedDraft = groupLabelDraft.trim();
    const canonical = group.toLowerCase();
    const isRename = Boolean(onRenameGroupKey)
      && projectId !== null
      && trimmedDraft.length > 0
      && trimmedDraft.toLowerCase() !== canonical;

    if (isRename) {
      const sourceCasings = [...new Set(
        screenshots
          .filter((screenshot) => (
            screenshot.project_id === projectId
            && (screenshot.group ?? '').toLowerCase() === canonical
          ))
          .map((screenshot) => screenshot.group ?? '')
          .filter(Boolean),
      )];
      const sourceCount = screenshots.filter((screenshot) => (
        screenshot.project_id === projectId
        && (screenshot.group ?? '').toLowerCase() === canonical
      )).length;
      setRenameConfirm({ group, newName: trimmedDraft, count: sourceCount, sourceCasings });
      return;
    }

    setIsSavingGroupAppearance(true);
    try {
      const result = await saveAppearanceForGroup(group);
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

  async function performRenameAndSave() {
    if (!renameConfirm || !onRenameGroupKey || !projectId) return;
    const { group, newName, sourceCasings } = renameConfirm;
    setIsSavingGroupAppearance(true);
    try {
      const renameResult = await onRenameGroupKey(projectId, sourceCasings, newName);
      if (!renameResult.ok) {
        setGroupSaveMessage(renameResult.error || 'Rename failed');
        return;
      }
      // After rename, the appearance row should target the NEW key so the
      // label sticks to the new identity.
      const appearanceResult = await saveAppearanceForGroup(newName);
      if (!appearanceResult.ok) {
        setGroupSaveMessage(appearanceResult.error);
        return;
      }
      const variantNote = sourceCasings.length > 1
        ? ` (merged ${sourceCasings.length} casings: ${sourceCasings.join(', ')})`
        : '';
      setGroupSaveMessage(
        `Renamed "${group}" → "${newName}". ${renameResult.updatedCount} screenshot${renameResult.updatedCount === 1 ? '' : 's'} updated${variantNote}.`,
      );
      setRenameConfirm(null);
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
        label: groupLabelDraft,
        ...getAppearanceScope(),
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
      label: groupLabelDraft,
      ...getAppearanceScope(),
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
            {TEAM_UPLOAD_ANALYTICS_ENABLED && (
              <button type="button" className={`catalogue-team__sub-tab ${subTab === 'analytics' ? 'is-active' : ''}`} onClick={() => setSubTab('analytics')}>
                Upload Analytics
              </button>
            )}
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'flows' ? 'is-active' : ''}`} onClick={() => setSubTab('flows')}>
              Flows
            </button>
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'groups' ? 'is-active' : ''}`} onClick={() => setSubTab('groups')}>
              Groups
            </button>
          </div>
          {TEAM_UPLOAD_ANALYTICS_ENABLED && subTab === 'analytics' && <p>Date-wise screenshot uploads grouped in IST with Web and Mobile split.</p>}
          {subTab === 'flows' && <p>All flows from uploaded screenshots. {flowChecklist.length} flow{flowChecklist.length !== 1 ? 's' : ''} tracked.</p>}
          {subTab === 'groups' && <p>All groups used in uploaded screenshots. {groupChecklist.length} group{groupChecklist.length !== 1 ? 's' : ''} found.</p>}
        </div>
      </div>

      {TEAM_UPLOAD_ANALYTICS_ENABLED && subTab === 'analytics' && (
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
          {!projectId && <div className="catalogue-team__group-note">No project selected. Group edits apply to all projects.</div>}
          {groupSaveMessage && (
            <div className="catalogue-team__group-note">
              {groupSaveMessage}
            </div>
          )}
          {groupChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No groups found yet. Add or rename screenshot groups to populate this list.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {groupChecklist.map((item) => (
                <div key={item.group.toLowerCase()} className="catalogue-team__checklist-item catalogue-team__checklist-item--group">
                  <div className="catalogue-team__group-meta">
                    <CatalogueGroupLabel
                      className="catalogue-team__checklist-flow"
                      group={item.group}
                      projectId={projectId}
                    />
                    <span className="catalogue-team__checklist-count">{item.count} screenshot{item.count !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    type="button"
                    className="catalogue-team__group-edit-btn"
                    onClick={() => beginGroupEdit(item.group)}
                    title="Edit icon"
                    aria-label="Edit icon"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editingGroupKey && (
        <GroupAppearanceEditModal
          group={editingGroupOriginal}
          labelDraft={groupLabelDraft}
          iconUrlDraft={groupIconUrlDraft}
          hasUploadedIcon={Boolean(groupIconStoragePathDraft)}
          isUploading={isUploadingGroupIcon}
          isSaving={isSavingGroupAppearance}
          message={groupSaveMessage}
          onChangeLabel={setGroupLabelDraft}
          onPickFile={(file) => { void handleGroupIconUpload(editingGroupOriginal, file); }}
          onRemoveUploadedIcon={() => { void handleRemoveUploadedIcon(editingGroupOriginal); }}
          onSave={() => { void saveGroupAppearance(editingGroupOriginal); }}
          onCancel={cancelGroupEdit}
        />
      )}

      {renameConfirm && (
        <ConfirmModal
          title="Rename group?"
          message={
            renameConfirm.sourceCasings.length > 1
              ? `Rename "${renameConfirm.group}" → "${renameConfirm.newName}" across the project. This updates the group field on ${renameConfirm.count} screenshot${renameConfirm.count === 1 ? '' : 's'} (across casings: ${renameConfirm.sourceCasings.join(', ')}) and the display label.`
              : `Rename "${renameConfirm.group}" → "${renameConfirm.newName}" across the project. This updates the group field on ${renameConfirm.count} screenshot${renameConfirm.count === 1 ? '' : 's'} and the display label.`
          }
          confirmLabel={`Rename "${renameConfirm.group}"`}
          cancelLabel="Cancel"
          danger={false}
          onConfirm={() => { void performRenameAndSave(); }}
          onCancel={() => setRenameConfirm(null)}
        />
      )}
    </section>
  );
}
