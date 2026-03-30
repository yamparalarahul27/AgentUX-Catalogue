import type { RouteNode } from '../types';

export interface RouteHierarchyNode {
  id: string;
  segment: string;
  label: string;
  fullPath: string;
  route: RouteNode | null;
  children: RouteHierarchyNode[];
  depth: number;
}

interface MutableHierarchyNode extends RouteHierarchyNode {
  childMap: Map<string, MutableHierarchyNode>;
}

export function buildRouteHierarchy(routes: RouteNode[]): RouteHierarchyNode[] {
  const root: MutableHierarchyNode = createGroupNode('__root__', '', '', 0);

  for (const route of [...routes].sort((left, right) => left.path.localeCompare(right.path))) {
    const segments = getPathSegments(route.path);

    if (segments.length === 0) {
      root.childMap.set(
        route.id,
        {
          id: route.id,
          segment: '/',
          label: route.name,
          fullPath: route.path,
          route,
          children: [],
          depth: 0,
          childMap: new Map<string, MutableHierarchyNode>(),
        },
      );
      continue;
    }

    let currentNode = root;
    let currentPath = '';

    for (const [index, segment] of segments.entries()) {
      currentPath = `${currentPath}/${segment}`;
      const isLeaf = index === segments.length - 1;
      const existingChild = currentNode.childMap.get(segment);

      if (existingChild) {
        if (isLeaf) {
          existingChild.route = route;
          existingChild.id = route.id;
          existingChild.label = route.name;
          existingChild.fullPath = route.path;
        }
        currentNode = existingChild;
        continue;
      }

      const nextNode: MutableHierarchyNode = isLeaf
        ? {
            id: route.id,
            segment,
            label: route.name,
            fullPath: route.path,
            route,
            children: [],
            depth: index,
            childMap: new Map<string, MutableHierarchyNode>(),
          }
        : createGroupNode(`group:${currentPath}`, segment, currentPath, index);

      currentNode.childMap.set(segment, nextNode);
      currentNode = nextNode;
    }
  }

  return finalizeHierarchy(Array.from(root.childMap.values()));
}

function finalizeHierarchy(nodes: MutableHierarchyNode[]): RouteHierarchyNode[] {
  return nodes
    .sort((left, right) => compareNodes(left, right))
    .map((node) => ({
      id: node.id,
      segment: node.segment,
      label: node.label,
      fullPath: node.fullPath,
      route: node.route,
      depth: node.depth,
      children: finalizeHierarchy(Array.from(node.childMap.values())),
    }));
}

function compareNodes(left: MutableHierarchyNode, right: MutableHierarchyNode): number {
  if (left.fullPath === '/') return -1;
  if (right.fullPath === '/') return 1;
  return left.fullPath.localeCompare(right.fullPath);
}

function createGroupNode(
  id: string,
  segment: string,
  fullPath: string,
  depth: number,
): MutableHierarchyNode {
  return {
    id,
    segment,
    label: formatSegmentLabel(segment),
    fullPath,
    route: null,
    depth,
    children: [],
    childMap: new Map<string, MutableHierarchyNode>(),
  };
}

function getPathSegments(routePath: string): string[] {
  const cleanedPath = routePath.split('?')[0].split('#')[0];
  if (cleanedPath === '/' || cleanedPath === '') {
    return [];
  }

  return cleanedPath.split('/').filter(Boolean);
}

function formatSegmentLabel(segment: string): string {
  if (!segment) {
    return 'Home';
  }

  const normalized = segment
    .replace(/[[\]]/g, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!normalized) {
    return segment;
  }

  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
