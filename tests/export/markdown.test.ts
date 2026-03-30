import { describe, it, expect } from 'vitest';
import { generateMarkdown } from '../../src/export';
import type { AppMapData } from '../../src/types';
import { addJourney, createJourney, createWorkspace, toggleJourneyBoundary, toggleJourneyEdgeChange } from '../../src/workspace';

describe('Markdown Export', () => {
  const mockData: AppMapData = {
    routes: [
      {
        id: 'route-home',
        path: '/',
        name: 'Home',
        componentFile: 'app/page.tsx',
        framework: 'nextjs-app',
        source: 'static',
      },
      {
        id: 'route-dashboard',
        path: '/dashboard',
        name: 'Dashboard',
        componentFile: 'app/dashboard/page.tsx',
        framework: 'nextjs-app',
        source: 'static',
      },
      {
        id: 'route-users',
        path: '/users',
        name: 'Users',
        componentFile: 'app/users/page.tsx',
        framework: 'nextjs-app',
        source: 'both',
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceRouteId: 'route-home',
        targetRouteId: 'route-dashboard',
        type: 'link',
        sourceFile: 'app/page.tsx',
        sourceLine: 7,
      },
      {
        id: 'edge-2',
        sourceRouteId: 'route-dashboard',
        targetRouteId: 'route-users',
        type: 'navigate',
        sourceFile: 'app/dashboard/page.tsx',
        sourceLine: 12,
      },
    ],
    framework: 'nextjs-app',
    scannedAt: '2026-03-18T10:00:00.000Z',
  };

  it('generates valid markdown with all sections', () => {
    const md = generateMarkdown(mockData);

    expect(md).toContain('# AgentUX Flow Spec');
    expect(md).toContain('## Current Screens');
    expect(md).toContain('## Current Navigation Flows');
    expect(md).toContain('## Current Flow Signals');
    expect(md).toContain('## Structured Data');
  });

  it('includes all screens with correct details', () => {
    const md = generateMarkdown(mockData);

    expect(md).toContain('### Home');
    expect(md).toContain('**Path**: `/`');
    expect(md).toContain('**Component**: `app/page.tsx`');
    expect(md).toContain('### Dashboard');
    expect(md).toContain('### Users');
  });

  it('includes navigation flows with source info', () => {
    const md = generateMarkdown(mockData);

    expect(md).toContain('Home → Dashboard');
    expect(md).toContain('`<Link>`');
    expect(md).toContain('app/page.tsx:7');
    expect(md).toContain('Dashboard → Users');
    expect(md).toContain('`useNavigate`');
  });

  it('includes correct summary counts', () => {
    const md = generateMarkdown(mockData);

    expect(md).toContain('**Screens**: 3');
    expect(md).toContain('**Flows**: 2');
    expect(md).toContain('**Framework**: Next.js App Router');
  });

  it('marks runtime-detected sources', () => {
    const md = generateMarkdown(mockData);
    expect(md).toContain('**Source**: both');
  });

  it('includes open questions and structured data for AI handoff', () => {
    const md = generateMarkdown(mockData);

    expect(md).toContain('## Open Questions For Next Change');
    expect(md).toContain('What should happen after Users?');
    expect(md).toContain('"sourceRouteName": "Home"');
    expect(md).toContain('"entryRouteIds"');
  });

  it('includes intended journey sections when a draft workspace is provided', () => {
    const draftJourney = createJourney('Signup Journey', '2026-03-18T10:05:00.000Z');
    let workspace = addJourney(createWorkspace(mockData), draftJourney);
    workspace = toggleJourneyBoundary(workspace, draftJourney.id, 'route-home', 'start');
    workspace = toggleJourneyBoundary(workspace, draftJourney.id, 'route-users', 'end');
    workspace = toggleJourneyEdgeChange(
      workspace,
      draftJourney.id,
      'route-home',
      'route-users',
      'add',
    );

    const md = generateMarkdown(mockData, {
      workspace,
      journeyId: draftJourney.id,
    });

    expect(md).toContain('## Intended Journey');
    expect(md).toContain('Signup Journey');
    expect(md).toContain('## Intended Flow Changes');
    expect(md).toContain('Add flow: Home -> Users');
    expect(md).toContain('## Requested Changes For AI');
    expect(md).toContain('"intendedJourney"');
  });
});
