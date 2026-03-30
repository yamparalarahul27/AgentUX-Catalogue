/** A discovered route/screen in the application */
export interface RouteNode {
  /** Unique identifier (derived from path) */
  id: string;
  /** Route path: "/dashboard", "/users/:id" */
  path: string;
  /** Human-readable screen name: "Dashboard", "User Detail" */
  name: string;
  /** File path of the component: "app/dashboard/page.tsx" */
  componentFile?: string;
  /** Which framework/router this route belongs to */
  framework: 'nextjs-app' | 'nextjs-pages' | 'react-router' | 'unknown';
  /** How this route was discovered */
  source: 'static' | 'runtime' | 'both';
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** A navigation flow between two screens */
export interface FlowEdge {
  /** Unique identifier */
  id: string;
  /** Source route ID (the screen navigating from) */
  sourceRouteId: string;
  /** Target route ID (the screen navigating to) */
  targetRouteId: string;
  /** Type of navigation */
  type: 'link' | 'navigate' | 'redirect' | 'inferred';
  /** File where the navigation call was found */
  sourceFile?: string;
  /** Line number of the Link/navigate call */
  sourceLine?: number;
}

/** The complete app map data structure — the core contract between all modules */
export interface AppMapData {
  /** All discovered routes/screens */
  routes: RouteNode[];
  /** All navigation flows between screens */
  edges: FlowEdge[];
  /** Detected framework */
  framework: string;
  /** When the analysis was performed */
  scannedAt: string;
}

/** Semantic role a screen plays within an intended journey */
export type RouteRole = 'entry' | 'step' | 'decision' | 'terminal';

/** Optional user-authored metadata for a route inside a workspace */
export interface RouteAnnotation {
  /** Semantic role assigned by the developer */
  role?: RouteRole;
  /** Optional notes that help explain why a screen exists */
  notes?: string;
}

/** Manual change to the detected flow within an intended journey */
export interface JourneyEdgeChange {
  /** Unique identifier */
  id: string;
  /** Source route ID */
  sourceRouteId: string;
  /** Target route ID */
  targetRouteId: string;
  /** Whether this flow is being added or removed */
  change: 'add' | 'remove';
  /** Optional reason for the change */
  rationale?: string;
}

/** A developer-authored intended journey layered on top of detected flow */
export interface Journey {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Start screens for the intended journey */
  startRouteIds: string[];
  /** End screens for the intended journey */
  endRouteIds: string[];
  /** Manual flow changes */
  edgeChanges: JourneyEdgeChange[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/** Persistable workspace state layered on top of detected app data */
export interface Workspace {
  /** Detected graph used as the source of truth */
  baseData: AppMapData;
  /** User-authored intended journeys */
  journeys: Journey[];
  /** Optional annotations keyed by route ID */
  annotations: Record<string, RouteAnnotation>;
  /** Last time the workspace was saved/updated */
  savedAt?: string;
}

/** Configuration for the <AppMap /> component */
export interface AppMapConfig {
  /** Root directory for static analysis (defaults to process.cwd()) */
  rootDir?: string;
  /** Enable/disable static analysis */
  staticAnalysis?: boolean;
  /** Enable/disable runtime detection */
  runtimeDetection?: boolean;
  /** Position of the floating button */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Pre-computed data (skip analysis, just visualize) */
  data?: AppMapData;
  /** Dev-only guard: hide in production (default: true) */
  devOnly?: boolean;
  /** Custom theme overrides */
  theme?: Partial<AppMapTheme>;
  /** Optional workspace state for intended journey editing */
  workspace?: Workspace;
}

/** Theme configuration */
export interface AppMapTheme {
  /** Primary accent color */
  accentColor: string;
  /** Background color for the modal */
  bgColor: string;
  /** Text color */
  textColor: string;
  /** Node background color */
  nodeBgColor: string;
  /** Node border color */
  nodeBorderColor: string;
  /** Edge color */
  edgeColor: string;
}

/** Result from static analysis of a single file for navigation links */
export interface LinkDetectionResult {
  /** The file that was scanned */
  sourceFile: string;
  /** Route ID of the source screen (the file's own route) */
  sourceRouteId: string;
  /** Detected navigation targets */
  targets: Array<{
    /** The target path or route */
    targetPath: string;
    /** Type of navigation */
    type: FlowEdge['type'];
    /** Line number where the navigation was found */
    line: number;
  }>;
}

/** Result from the static analysis scanner */
export interface ScanResult {
  /** Detected framework */
  framework: RouteNode['framework'];
  /** Discovered routes */
  routes: RouteNode[];
}
