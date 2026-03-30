import { describe, expect, it } from 'vitest';
import { buildRouteHierarchy } from '../../src/utils/route-hierarchy';
import type { RouteNode } from '../../src/types';

describe('buildRouteHierarchy', () => {
  it('groups nested routes under their main screens', () => {
    const routes: RouteNode[] = [
      { id: 'home', path: '/', name: 'Home', framework: 'nextjs-app', source: 'static' },
      { id: 'dashboard', path: '/dashboard', name: 'Dashboard', framework: 'nextjs-app', source: 'static' },
      { id: 'transactions', path: '/dashboard/transactions', name: 'Transactions', framework: 'nextjs-app', source: 'static' },
      { id: 'settings', path: '/settings/profile', name: 'Profile', framework: 'nextjs-app', source: 'static' },
    ];

    const hierarchy = buildRouteHierarchy(routes);

    expect(hierarchy.map((node) => node.fullPath)).toEqual(['/', '/dashboard', '/settings']);
    expect(hierarchy[1].children.map((node) => node.fullPath)).toEqual(['/dashboard/transactions']);
    expect(hierarchy[2].children.map((node) => node.fullPath)).toEqual(['/settings/profile']);
  });
});
