import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  Flag,
  Images,
  LayoutGrid,
  Monitor,
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
  readCatalogueGroupAppearanceMap,
  resolveCatalogueGroupAppearance,
  subscribeCatalogueGroupAppearance,
} from '../lib/catalogue-group-appearance';
import type {
  CatalogueGroupCategory,
  CatalogueGroupRegion,
} from '../lib/catalogue-group-appearance';
import { useGroupAppearanceEditor } from '../hooks/use-group-appearance-editor';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import { TEAM_UPLOAD_ANALYTICS_ENABLED } from '../lib/feature-flags';
import type { ScreenshotNode, WebPreset } from '../types';
import { CatalogueWebPresetsSection } from './CatalogueWebPresetsSection';
import { AdminUnlockScreen } from './AdminUnlockScreen';
import { CatalogueFlagsSection } from './CatalogueFlagsSection';
import { CatalogueRolesSection } from './CatalogueRolesSection';
import { useAdminUnlock } from '../hooks/use-admin-unlock';
import { CatalogueGroupLabel } from './CatalogueGroupLabel';
import { CatalogueMembersSection } from './CatalogueMembersSection';
import { CatalogueTrashSection } from './CatalogueTrashSection';
import { ConfirmModal } from './ConfirmModal';
import { GroupAppearanceEditModal } from './GroupAppearanceEditModal';
import { IconTooltip, IconTooltipProvider } from './IconTooltip';
import { Toast } from './Toast';

type TeamSubTab =
  | 'analytics'
  | 'flows'
  | 'groups'
  | 'web-presets'
  | 'trash'
  | 'flags'
  | 'members'
  | 'roles';

interface CatalogueTeamSectionProps {
  screenshots: ScreenshotNode[];
  currentUserEmail: string;
  // When provided, saving a group editor with a changed name will also
  // rename every underlying `screenshots.group` row whose casing matches
  // any of `oldNames`. The Team checklist groups by lowercase canonical,
  // so the source list catches all DB variants under one click.
  onRenameGroupKey?: (
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
  // Web presets used to live in the gear-icon modal; now an admin-only
  // sub-tab here. Saving still persists per-user via
  // useCatalogueSettings.saveWebPresets — admins manage their own
  // presets, but the UI access is gated to the Team section.
  webPresets?: WebPreset[];
  presetUsage?: Record<string, number>;
  onSaveWebPresets?: (webPresets: WebPreset[]) => Promise<void> | void;
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
  { label: 'Other', value: 'other' },
  { label: 'Untagged', value: 'untagged' },
];

const REGION_FILTER_OPTIONS: { label: string; value: GroupRegionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'India', value: 'india' },
  { label: 'Global', value: 'global' },
  { label: 'Untagged', value: 'untagged' },
];

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
  screenshots,
  currentUserEmail,
  onRenameGroupKey,
  onTrashRestored,
  onSelectFlow,
  onSelectGroup,
  webPresets,
  presetUsage,
  onSaveWebPresets,
}: CatalogueTeamSectionProps) {
  // Groups is the default sub-tab when entering Team — matches the
  // user's expectation that the Settings icon "opens" group config.
  // Sidebar tab order also leads with Groups, so the body should
  // mirror that.
  const [subTab, setSubTab] = useState<TeamSubTab>('groups');
  // Shared admin-passcode unlock state — Members + Roles both read from
  // here, so unlocking once in either sub-tab unlocks the other for the
  // tab session (persisted to sessionStorage). Stale-passcode rebound is
  // wired via clearUnlock as onUnauthorized on the children.
  const { adminPasscode, unlocked: adminUnlocked, unlock: handleAdminUnlock, clearUnlock: handleAdminUnauthorized } = useAdminUnlock();
  const [groupAppearanceMap, setGroupAppearanceMap] = useState(readCatalogueGroupAppearanceMap);
  const editor = useGroupAppearanceEditor({ screenshots, onRenameGroupKey });
  const [groupSearch, setGroupSearch] = useState('');
  const [groupTypeFilter, setGroupTypeFilter] = useState<GroupTypeFilter>('all');
  const [groupRegionFilter, setGroupRegionFilter] = useState<GroupRegionFilter>('all');
  const [flowSearch, setFlowSearch] = useState('');

  // Settings → Team panels (Analytics, Flows, Groups) span every project
  // the user has access to, matching the catalogue chip strip + filter
  // dropdown which also use `fullScopeScreenshots` without project scoping.
  // The earlier `projects[0]?.id` scope silently hid groups (e.g. Allinx,
  // Bvox) that lived in any project other than the first.
  const scopedScreenshots = screenshots;

  const rows = useMemo(
    () => buildTeamUploadAnalyticsRows(scopedScreenshots),
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
      const appearance = resolveCatalogueGroupAppearance(groupAppearanceMap, item.group, null);
      return { ...item, category: appearance.category, region: appearance.region };
    }),
    [groupAppearanceMap, groupChecklist],
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
    void ensureCatalogueGroupAppearanceLoaded();
  }, []);

  function clearGroupFilters() {
    setGroupSearch('');
    setGroupTypeFilter('all');
    setGroupRegionFilter('all');
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
      id: 'groups',
      label: 'Groups',
      icon: LayoutGrid,
      count: groupChecklist.length,
      description: `All groups used in uploaded screenshots. ${groupChecklist.length} group${groupChecklist.length !== 1 ? 's' : ''} found. Click a group to filter the catalogue.`,
    },
    {
      id: 'flows',
      label: 'Flows',
      icon: Workflow,
      count: flowChecklist.length,
      description: `All flows from uploaded screenshots. ${flowChecklist.length} flow${flowChecklist.length !== 1 ? 's' : ''} tracked. Click a flow to filter the catalogue.`,
    },
    ...(webPresets && onSaveWebPresets
      ? [{
          id: 'web-presets' as TeamSubTab,
          label: 'Web Presets',
          icon: Monitor,
          count: webPresets.length,
          description: 'Variant presets used when uploading or editing screenshots. Reorder, rename, or add new viewport widths.',
        }]
      : []),
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
    <IconTooltipProvider>
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
                        projectId={null}
                        iconSize={36}
                      />
                      <IconTooltip label="Edit group">
                        <button
                          type="button"
                          className="catalogue-team__group-edit-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            editor.beginEdit(item.group);
                          }}
                          aria-label="Edit group"
                        >
                          <Pencil size={14} />
                        </button>
                      </IconTooltip>
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

      {subTab === 'web-presets' && webPresets && onSaveWebPresets && (
        <CatalogueWebPresetsSection
          webPresets={webPresets}
          presetUsage={presetUsage ?? {}}
          onSave={onSaveWebPresets}
        />
      )}

      {subTab === 'trash' && (
        <CatalogueTrashSection onRestored={onTrashRestored} />
      )}

      {subTab === 'flags' && (
        <CatalogueFlagsSection />
      )}

      {subTab === 'members' && (
        adminUnlocked
          ? <CatalogueMembersSection
              currentUserEmail={currentUserEmail}
              adminPasscode={adminPasscode}
              onUnauthorized={handleAdminUnauthorized}
            />
          : <AdminUnlockScreen
              title="Members"
              description="Enter the admin passcode to manage members."
              onUnlock={handleAdminUnlock}
            />
      )}

      {subTab === 'roles' && (
        adminUnlocked
          ? <CatalogueRolesSection
              adminPasscode={adminPasscode}
              onUnauthorized={handleAdminUnauthorized}
            />
          : <AdminUnlockScreen
              title="Roles"
              description="Enter the admin passcode to manage roles + capabilities."
              onUnlock={handleAdminUnlock}
            />
      )}

      {editor.editingGroupKey && (
        <GroupAppearanceEditModal
          group={editor.editingGroupOriginal}
          labelDraft={editor.labelDraft}
          iconUrlDraft={editor.iconUrlDraft}
          categoryDraft={editor.categoryDraft}
          regionDraft={editor.regionDraft}
          hasUploadedIcon={editor.hasUploadedIcon}
          isUploading={editor.isUploading}
          isSaving={editor.isSaving}
          message={editor.saveMessage}
          onChangeLabel={editor.setLabelDraft}
          onChangeCategory={editor.setCategoryDraft}
          onChangeRegion={editor.setRegionDraft}
          onPickFile={(file) => { void editor.handleIconUpload(file); }}
          onRemoveUploadedIcon={() => { void editor.handleRemoveIcon(); }}
          onSave={() => { void editor.save(); }}
          onCancel={editor.cancelEdit}
        />
      )}

        </div>
      </div>

      {editor.renameConfirm && (
        <ConfirmModal
          title="Rename group?"
          message={
            editor.renameConfirm.sourceCasings.length > 1
              ? `Rename "${editor.renameConfirm.group}" → "${editor.renameConfirm.newName}" across the project. This updates the group field on ${editor.renameConfirm.count} screenshot${editor.renameConfirm.count === 1 ? '' : 's'} (across casings: ${editor.renameConfirm.sourceCasings.join(', ')}) and the display label.`
              : `Rename "${editor.renameConfirm.group}" → "${editor.renameConfirm.newName}" across the project. This updates the group field on ${editor.renameConfirm.count} screenshot${editor.renameConfirm.count === 1 ? '' : 's'} and the display label.`
          }
          confirmLabel={`Rename "${editor.renameConfirm.group}"`}
          cancelLabel="Cancel"
          danger={false}
          onConfirm={() => { void editor.performRename(); }}
          onCancel={editor.cancelRename}
        />
      )}

      {editor.saveMessage && (
        <Toast
          message={editor.saveMessage}
          type="success"
          onClose={() => editor.setSaveMessage(null)}
          duration={3000}
        />
      )}
    </section>
    </IconTooltipProvider>
  );
}
