import { useEffect, useRef, useState } from 'react';
import type { FlowEdge, RouteNode } from '../types';
import { NavigationTracker } from './navigation-tracker';
import { pathToId, pathToScreenName } from '../analysis/parsers/common';

interface RuntimeData {
  routes: RouteNode[];
  edges: FlowEdge[];
}

/** React hook that tracks runtime navigation and discovers routes/edges */
export function useRuntimeRoutes(enabled = true, refreshKey = 0): RuntimeData {
  const [data, setData] = useState<RuntimeData>({ routes: [], edges: [] });
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    lastKeyRef.current = '';

    const tracker = new NavigationTracker();
    tracker.start();

    // Add the initial route
    const initialPath = window.location.pathname;
    setData({
      routes: [createRuntimeRoute(initialPath)],
      edges: [],
    });

    // Poll for new navigation events periodically
    const interval = setInterval(() => {
      const uniqueEdges = tracker.getUniqueEdges();
      const currentPath = window.location.pathname;

      // Change detection: skip update if nothing changed
      const key = uniqueEdges.map((e) => `${e.from}→${e.to}`).join('|') + '::' + currentPath;
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;

      const allPaths = new Set<string>();

      // Collect all unique paths from navigation events
      allPaths.add(initialPath);
      for (const edge of uniqueEdges) {
        allPaths.add(edge.from);
        allPaths.add(edge.to);
      }
      allPaths.add(currentPath);

      const routes = Array.from(allPaths).map(createRuntimeRoute);
      // Stable edge IDs based on route pair, not array index
      const edges: FlowEdge[] = uniqueEdges.map((edge) => ({
        id: `runtime-${pathToId(edge.from)}-${pathToId(edge.to)}`,
        sourceRouteId: pathToId(edge.from),
        targetRouteId: pathToId(edge.to),
        type: 'inferred' as const,
      }));

      setData({ routes, edges });
    }, 2000);

    return () => {
      clearInterval(interval);
      tracker.stop();
    };
  }, [enabled, refreshKey]);

  return data;
}

function createRuntimeRoute(routePath: string): RouteNode {
  return {
    id: pathToId(routePath),
    path: routePath,
    name: pathToScreenName(routePath),
    framework: 'unknown',
    source: 'runtime',
  };
}

export { NavigationTracker } from './navigation-tracker';
