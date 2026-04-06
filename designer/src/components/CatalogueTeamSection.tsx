import { useMemo, useState } from 'react';

import { getScreenshotFlowLabel } from '../lib/catalogue-families';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import type { Project, ScreenshotNode } from '../types';
import { Dropdown } from './Dropdown';

type TeamSubTab = 'analytics' | 'checklist';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
}

interface FlowChecklistItem {
  flow: string;
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

export function CatalogueTeamSection({ projects, screenshots }: CatalogueTeamSectionProps) {
  const [subTab, setSubTab] = useState<TeamSubTab>('analytics');
  const [projectId, setProjectId] = useState<string | null>(null);

  const projectOptions = useMemo(
    () => projects
      .map((project) => ({ label: project.name, value: project.id }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [projects],
  );

  const rows = useMemo(
    () => buildTeamUploadAnalyticsRows(screenshots, projectId),
    [projectId, screenshots],
  );

  const flowChecklist = useMemo(() => buildFlowChecklist(screenshots), [screenshots]);

  return (
    <section className="catalogue-team">
      <div className="catalogue-team__head">
        <div className="catalogue-team__copy">
          <div className="catalogue-team__sub-tabs">
            <button
              type="button"
              className={`catalogue-team__sub-tab ${subTab === 'analytics' ? 'is-active' : ''}`}
              onClick={() => setSubTab('analytics')}
            >
              Upload Analytics
            </button>
            <button
              type="button"
              className={`catalogue-team__sub-tab ${subTab === 'checklist' ? 'is-active' : ''}`}
              onClick={() => setSubTab('checklist')}
            >
              Checklist
            </button>
          </div>
          {subTab === 'analytics' && (
            <p>Date-wise screenshot uploads grouped in IST with Web and Mobile split.</p>
          )}
          {subTab === 'checklist' && (
            <p>All flows from uploaded screenshots. {flowChecklist.length} flows tracked.</p>
          )}
        </div>
        {subTab === 'analytics' && (
          <div className="catalogue-team__filters">
            <Dropdown
              value={projectId}
              options={projectOptions}
              placeholder="All projects"
              onChange={setProjectId}
            />
          </div>
        )}
      </div>

      {subTab === 'analytics' && (
        <>
          {rows.length === 0 ? (
            <div className="catalogue-team__empty">
              No upload data available for the selected scope.
            </div>
          ) : (
            <div className="catalogue-team__table-wrap">
              <table className="catalogue-team__table">
                <thead>
                  <tr>
                    <th>Date (IST)</th>
                    <th>User</th>
                    <th>Web</th>
                    <th>Mobile</th>
                    <th>Total</th>
                  </tr>
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

      {subTab === 'checklist' && (
        <>
          {flowChecklist.length === 0 ? (
            <div className="catalogue-team__empty">
              No flows found. Upload screenshots with flow labels to populate this checklist.
            </div>
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
    </section>
  );
}
