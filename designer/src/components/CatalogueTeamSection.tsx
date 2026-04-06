import { useMemo, useState } from 'react';

import { getScreenshotFlowLabel } from '../lib/catalogue-families';
import { buildTeamUploadAnalyticsRows, formatTeamAnalyticsDate } from '../lib/catalogue-team-analytics';
import type { Project, ScreenshotNode } from '../types';
import { Dropdown } from './Dropdown';

type TeamSubTab = 'analytics' | 'flows' | 'prototypes';

const PROTOTYPE_LINKS_KEY = 'catalogue:prototype-links';

interface CatalogueTeamSectionProps {
  projects: Project[];
  screenshots: ScreenshotNode[];
}

interface FlowChecklistItem {
  flow: string;
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
            <button type="button" className={`catalogue-team__sub-tab ${subTab === 'prototypes' ? 'is-active' : ''}`} onClick={() => setSubTab('prototypes')}>
              Figma Prototypes
            </button>
          </div>
          {subTab === 'analytics' && <p>Date-wise screenshot uploads grouped in IST with Web and Mobile split.</p>}
          {subTab === 'flows' && <p>All flows from uploaded screenshots. {flowChecklist.length} flows tracked.</p>}
          {subTab === 'prototypes' && <p>Figma prototype links for quick access. {protoLinks.length} link{protoLinks.length !== 1 ? 's' : ''} saved.</p>}
        </div>
        {subTab === 'analytics' && (
          <div className="catalogue-team__filters">
            <Dropdown value={projectId} options={projectOptions} placeholder="All projects" onChange={setProjectId} />
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
