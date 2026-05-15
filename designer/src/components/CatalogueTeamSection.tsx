import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  Flag,
  Images,
  LayoutGrid,
  Pencil,
  Search,
  Shield,
  Trash2,
  Users,
  Workflow,
} from 'lucide-react';

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
import type {
  CatalogueGroupCategory,
  CatalogueGroupRegion,
} from '../lib/catalogue-group-appearance';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import { TEAM_UPLOAD_ANALYTICS_ENABLED } from '../lib/feature-flags';
import type { Project, ScreenshotNode } from '../types';
import { CatalogueFlagsSection } from './CatalogueFlagsSection';
import { CatalogueRolesSection } from './CatalogueRolesSection';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { CatalogueMembersSection } from './CatalogueMembersSection';
import { CatalogueTrashSection } from './CatalogueTrashSection';
import { ConfirmModal } from './ConfirmModal';
import { GroupAppearanceEditModal } from './GroupAppearanceEditModal';
import { Toast } from './Toast';

type TeamSubTab = 'analytics' | 'flows' | 'groups' | 'trash' | 'flags' | 'members' | 'roles';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
  currentUserEmail: string;
  // When provided, saving a group editor with a changed name will also
  // rename every underlying `screenshots.group` row whose casing matches
  // any of `oldNames`. The Team checklist groups by lowercase canonical,
  // so the source list catches all DB variants under one click.
  onRenameGroupKey?: (
    projectId: string,
    oldNames: string[],
    newName: string,
  ) => Promise<{ ok: boolean; updatedCount: number; error?: string }>;
  // Trash subtab calls this after a successful restore so the parent
  // catalogue can refetch and the restored card reappears immediately.
  onTrashRestored?: () => void;
  // Clicking a flow/group row in the checklists hands the value to the
  // parent so it can set the toolbar filter and swap back to the main
  // catalogue view. The parent clears other filters to ensure the user
  // lands on a focused result set.
  onSelectFlow?: (flow: string) => void;
  onSelectGroup?: (group: string) => void;
}

interface FlowChecklistItem {
  flow: string;
  count: number;
}

interface GroupChecklistItem {
  group: string;
  count: number;
}

interface EnrichedGroupItem extends GroupChecklistItem {
  category: CatalogueGroupCategory | null;
  region: CatalogueGroupRegion | null;
}

type GroupTypeFilter = 'all' | CatalogueGroupCategory | 'untagged';
type GroupRegionFilter = 'all' | CatalogueGroupRegion | 'untagged';

const TYPE_FILTER_OPTIONS: { label: string; value: GroupTypeFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'CEX', value: 'cex' },
  { label: 'DEX', value: 'dex' },
  { label: 'Untagged', value: 'untagged' },
];

const REGION_FILTER_OPTIONS: { label: string; value: GroupRegionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'India', value: 'india' },
  { label: 'Global', value: 'global' },
  { label: 'Untagged', value: 'untagged' },
];

function isGroupTypeFilter(value: string | null): value is GroupTypeFilter {
  return value === 'all' || value === 'cex' || value === 'dex' || value === 'untagged';
}

function isGroupRegionFilter(value: string | null): value is GroupRegionFilter {
  return value === 'all' || value === 'india' || value === 'global' || value === 'untagged';
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

export function CatalogueTeamSection({
  projects,
  screenshots,
  currentUserEmail,
  onRenameGroupKey,
  onTrashRestored,
  onSelectFlow,
  onSelectGroup,
}: CatalogueTeamSectionProps) {
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
  const [groupCategoryDraft, setGroupCategoryDraft] = useState<CatalogueGroupCategory | null>(null);
  const [groupRegionDraft, setGroupRegionDraft] = useState<CatalogueGroupRegion | null>(null);
  const [groupSaveMessage, setGroupSaveMessage] = useState<string | null>(null);
  const [isSavingGroupAppearance, setIsSavingGroupAppearance] = useState(false);
  const [isUploadingGroupIcon, setIsUploadingGroupIcon] = useState(false);
  const [renameConfirm, setRenameConfirm] = useState<{ group: string; newName: string; count: number; sourceCasings: string[] } | null>(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupTypeFilter, setGroupTypeFilter] = useState<GroupTypeFilter>('all');
  const [groupRegionFilter, setGroupRegionFilter] = useState<GroupRegionFilter>('all');
  const [flowSearch, setFlowSearch] = useState('');

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

  const filteredFlowChecklist = useMemo(() => {
    const query = flowSearch.trim().toLowerCase();
    if (!query) return flowChecklist;
    return flowChecklist.filter((item) => item.flow.toLowerCase().includes(query));
  }, [flowChecklist, flowSearch]);

  const enrichedGroupChecklist = useMemo<EnrichedGroupItem[]>(
    () => groupChecklist.map((item) => {
      const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, item.group, projectId);
      return { ...item, category: appearance.category, region: appearance.region };
    }),
    [groupAppearanceMap, groupChecklist, projectId],
  );

  const filteredGroupChecklist = useMemo<EnrichedGroupItem[]>(() => {
    const query = groupSearch.trim().toLowerCase();
    return enrichedGroupChecklist.filter((item) => {
      if (query && !item.group.toLowerCase().includes(query)) return false;
      if (groupTypeFilter !== 'all') {
        if (groupTypeFilter === 'untagged') {
          if (item.category) return false;
        } else if (item.category !== groupTypeFilter) {
          return false;
        }
      }
      if (groupRegionFilter !== 'all') {
        if (groupRegionFilter === 'untagged') {
          if (item.region) return false;
        } else if (item.region !== groupRegionFilter) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedGroupChecklist, groupRegionFilter, groupSearch, groupTypeFilter]);

  const hasActiveGroupFilter = Boolean(
    groupSearch.trim() || groupTypeFilter !== 'all' || groupRegionFilter !== 'all',
  );

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

  // Hydrate filter state from URL on mount and on back/forward navigation.
  // Only applied when the Groups subtab is showing; values for the other
  // subtabs do not pollute the params (we strip them on write).
  useEffect(() => {
    function readFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q') ?? '';
      const type = params.get('type');
      const region = params.get('region');
      setGroupSearch(query);
      setGroupTypeFilter(isGroupTypeFilter(type) ? type : 'all');
      setGroupRegionFilter(isGroupRegionFilter(region) ? region : 'all');
    }
    readFromUrl();
    window.addEventListener('popstate', readFromUrl);
    return () => window.removeEventListener('popstate', readFromUrl);
  }, []);

  // Mirror filter state to the URL. Uses replaceState so search-input
  // keystrokes don't pile up in browser history.
  useEffect(() => {
    if (subTab !== 'groups') return;
    const params = new URLSearchParams(window.location.search);
    if (groupSearch.trim()) params.set('q', groupSearch.trim());
    else params.delete('q');
    if (groupTypeFilter !== 'all') params.set('type', groupTypeFilter);
    else params.delete('type');
    if (groupRegionFilter !== 'all') params.set('region', groupRegionFilter);
    else params.delete('region');
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [groupRegionFilter, groupSearch, groupTypeFilter, subTab]);

  function clearGroupFilters() {
    setGroupSearch('');
    setGroupTypeFilter('all');
    setGroupRegionFilter('all');
  }

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
    setGroupCategoryDraft(appearance.category);
    setGroupRegionDraft(appearance.region);
    setGroupSaveMessage(null);
  }

  function cancelGroupEdit() {
    setEditingGroupKey(null);
    setEditingGroupOriginal('');
    setGroupLabelDraft('');
    setGroupIconStoragePathDraft('');
    setGroupIconUrlDraft('');
    setGroupCategoryDraft(null);
    setGroupRegionDraft(null);
  }

  async function saveAppearanceForGroup(group: string) {
    const result = await saveCatalogueGroupAppearanceToSupabase({
      category: groupCategoryDraft,
      group,
      iconStoragePath: groupIconStoragePathDraft || null,
      iconUrl: groupIconUrlDraft || null,
      label: groupLabelDraft,
      region: groupRegionDraft,
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
        category: groupCategoryDraft,
        file,
        group,
        label: groupLabelDraft,
        region: groupRegionDraft,
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
      category: groupCategoryDraft,
      group,
      label: groupLabelDraft,
      region: groupRegionDraft,
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

  const subSections: { id: TeamSubTab; label: string; icon: typeof BarChart3; count?: number; description: string }[] = [
    ...(TEAM_UPLOAD_ANALYTICS_ENABLED
      ? [{
          id: 'analytics' as TeamSubTab,
          label: 'Upload Analytics',
          icon: BarChart3,
          description: 'Date-wise screenshot uploads grouped in IST with Web and Mobile split.',
        }]
      : []),
    {
      id: 'flows',
      label: 'Flows',
      icon: Workflow,
      count: flowChecklist.length,
      description: `All flows from uploaded screenshots. ${flowChecklist.length} flow${flowChecklist.length !== 1 ? 's' : ''} tracked. Click a flow to filter the catalogue.`,
    },
    {
      id: 'groups',
      label: 'Groups',
      icon: LayoutGrid,
      count: groupChecklist.length,
      description: `All groups used in uploaded screenshots. ${groupChecklist.length} group${groupChecklist.length !== 1 ? 's' : ''} found. Click a group to filter the catalogue.`,
    },
    {
      id: 'trash',
      label: 'Trash',
      icon: Trash2,
      description: 'Deleted screenshots from the last 15 days. Auto-purged after that.',
    },
    {
      id: 'flags',
      label: 'Flags',
      icon: Flag,
      description: 'Compile-time feature flags from feature-flags.ts. Read-only — flip a constant + redeploy to change.',
    },
    {
      id: 'members',
      label: 'Members',
      icon: Users,
      description: 'Mint, rotate, disable, or remove member passcodes. All actions require the admin passcode.',
    },
    {
      id: 'roles',
      label: 'Roles',
      icon: Shield,
      description: 'Manage roles + their capabilities. Create custom roles, toggle what each role can do.',
    },
  ];

  const activeSection = subSections.find((section) => section.id === subTab) ?? subSections[0];

  return (
    <section className="catalogue-team">
      <div className="catalogue-team__layout">
        <nav className="catalogue-team__nav" aria-label="Team section">
          {subSections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === subTab;
            return (
              <button
                key={section.id}
                type="button"
                className={`catalogue-team__nav-item${isActive ? ' is-active' : ''}`}
                onClick={() => setSubTab(section.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="catalogue-team__nav-label">{section.label}</span>
                {typeof section.count === 'number' && (
                  <span className="catalogue-team__nav-count">{section.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="catalogue-team__panel">
          <header className="catalogue-team__panel-head">
            <h3>{activeSection.label}</h3>
            <p>{activeSection.description}</p>
          </header>

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
          {flowChecklist.length > 0 && (
            <div className="catalogue-team__filterbar">
              <label className="catalogue-team__search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={flowSearch}
                  onChange={(event) => setFlowSearch(event.target.value)}
                  placeholder="Search flows…"
                  aria-label="Search flows"
                />
              </label>
            </div>
          )}

          {flowChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No flows found. Upload screenshots with flow labels to populate this list.</div>
          ) : filteredFlowChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No flows match the search.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {filteredFlowChecklist.map((item) => (
                <button
                  key={item.flow}
                  type="button"
                  className="catalogue-team__checklist-item catalogue-team__checklist-item--clickable"
                  onClick={() => onSelectFlow?.(item.flow)}
                  disabled={!onSelectFlow}
                >
                  <span className="catalogue-team__checklist-flow">{item.flow}</span>
                  <span className="catalogue-team__checklist-count" aria-label={`${item.count} screenshot${item.count !== 1 ? 's' : ''}`}>
                    <Images size={13} aria-hidden="true" />
                    {item.count}
                  </span>
                  {onSelectFlow && <ChevronRight size={14} className="catalogue-team__checklist-cta" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'groups' && (
        <>
          {!projectId && <div className="catalogue-team__group-note">No project selected. Group edits apply to all projects.</div>}

          {groupChecklist.length > 0 && (
            <div className="catalogue-team__filterbar">
              <label className="catalogue-team__search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                  placeholder="Search groups…"
                  aria-label="Search groups"
                />
              </label>

              <div className="catalogue-team__filtergroup" role="radiogroup" aria-label="Type">
                <span className="catalogue-team__filterlabel">Type</span>
                {TYPE_FILTER_OPTIONS.map((option) => {
                  const checked = groupTypeFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={`catalogue-team__filterchip${checked ? ' is-active' : ''}`}
                      onClick={() => setGroupTypeFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="catalogue-team__filtergroup" role="radiogroup" aria-label="Region">
                <span className="catalogue-team__filterlabel">Region</span>
                {REGION_FILTER_OPTIONS.map((option) => {
                  const checked = groupRegionFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={`catalogue-team__filterchip${checked ? ' is-active' : ''}`}
                      onClick={() => setGroupRegionFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasActiveGroupFilter && groupChecklist.length > 0 && (
            <div className="catalogue-team__filterstatus">
              <span>
                Showing {filteredGroupChecklist.length} of {groupChecklist.length} group{groupChecklist.length === 1 ? '' : 's'}
              </span>
              <button type="button" className="catalogue-team__filterclear" onClick={clearGroupFilters}>
                Clear
              </button>
            </div>
          )}

          {groupChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No groups found yet. Add or rename screenshot groups to populate this list.</div>
          ) : filteredGroupChecklist.length === 0 ? (
            <div className="catalogue-team__empty">No groups match the current filters.</div>
          ) : (
            <div className="catalogue-team__checklist">
              {filteredGroupChecklist.map((item) => {
                const handleRowActivate = () => onSelectGroup?.(item.group);
                return (
                  <div
                    key={item.group.toLowerCase()}
                    className={`catalogue-team__checklist-item catalogue-team__checklist-item--group${onSelectGroup ? ' catalogue-team__checklist-item--clickable' : ''}`}
                    role={onSelectGroup ? 'button' : undefined}
                    tabIndex={onSelectGroup ? 0 : undefined}
                    onClick={onSelectGroup ? handleRowActivate : undefined}
                    onKeyDown={onSelectGroup ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleRowActivate();
                      }
                    } : undefined}
                  >
                    <div className="catalogue-team__group-meta">
                      <CatalogueGroupLabel
                        className="catalogue-team__checklist-flow"
                        group={item.group}
                        projectId={projectId}
                        iconSize={36}
                      />
                      <button
                        type="button"
                        className="catalogue-team__group-edit-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          beginGroupEdit(item.group);
                        }}
                        title="Edit group"
                        aria-label="Edit group"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                    <span className="catalogue-team__checklist-count" aria-label={`${item.count} screenshot${item.count !== 1 ? 's' : ''}`}>
                      <Images size={13} aria-hidden="true" />
                      {item.count}
                    </span>
                    {(item.category || item.region) && (
                      <div className="catalogue-team__checklist-tags">
                        {item.category && (
                          <span className={`catalogue-team__checklist-tag catalogue-team__checklist-tag--${item.category}`}>
                            {item.category.toUpperCase()}
                          </span>
                        )}
                        {item.region && (
                          <span className={`catalogue-team__checklist-tag catalogue-team__checklist-tag--${item.region}`}>
                            {item.region === 'india' ? 'India' : 'Global'}
                          </span>
                        )}
                      </div>
                    )}
                    {onSelectGroup && <ChevronRight size={14} className="catalogue-team__checklist-cta" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'trash' && (
        <CatalogueTrashSection projects={projects} onRestored={onTrashRestored} />
      )}

      {subTab === 'flags' && (
        <CatalogueFlagsSection />
      )}

      {subTab === 'members' && (
        <CatalogueMembersSection currentUserEmail={currentUserEmail} />
      )}

      {subTab === 'roles' && (
        <CatalogueRolesSection />
      )}

      {editingGroupKey && (
        <GroupAppearanceEditModal
          group={editingGroupOriginal}
          labelDraft={groupLabelDraft}
          iconUrlDraft={groupIconUrlDraft}
          categoryDraft={groupCategoryDraft}
          regionDraft={groupRegionDraft}
          hasUploadedIcon={Boolean(groupIconStoragePathDraft)}
          isUploading={isUploadingGroupIcon}
          isSaving={isSavingGroupAppearance}
          message={groupSaveMessage}
          onChangeLabel={setGroupLabelDraft}
          onChangeCategory={setGroupCategoryDraft}
          onChangeRegion={setGroupRegionDraft}
          onPickFile={(file) => { void handleGroupIconUpload(editingGroupOriginal, file); }}
          onRemoveUploadedIcon={() => { void handleRemoveUploadedIcon(editingGroupOriginal); }}
          onSave={() => { void saveGroupAppearance(editingGroupOriginal); }}
          onCancel={cancelGroupEdit}
        />
      )}

        </div>
      </div>

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

      {groupSaveMessage && (
        <Toast
          message={groupSaveMessage}
          type="success"
          onClose={() => setGroupSaveMessage(null)}
          duration={3000}
        />
      )}
    </section>
  );
}
