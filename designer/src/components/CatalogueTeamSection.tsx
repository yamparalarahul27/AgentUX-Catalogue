import { useMemo, useState } from 'react';

import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import type { Project, ScreenshotNode } from '../types';
import { Dropdown } from './Dropdown';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
}

export function CatalogueTeamSection({ projects, screenshots }: CatalogueTeamSectionProps) {
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

  return (
    <section className="catalogue-team">
      <div className="catalogue-team__head">
        <div className="catalogue-team__copy">
          <h2>Team Upload Analytics</h2>
          <p>Date-wise screenshot uploads grouped in IST with Web and Mobile split.</p>
        </div>
        <div className="catalogue-team__filters">
          <Dropdown
            value={projectId}
            options={projectOptions}
            placeholder="All projects"
            onChange={setProjectId}
          />
        </div>
      </div>

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
    </section>
  );
}
