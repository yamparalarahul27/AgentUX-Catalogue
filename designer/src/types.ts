export interface Project {
  id: string;
  user_id: string;
  name: string;
  primary_group: string | null;
  vs_groups: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Flow {
  id: string;
  project_id: string;
  name: string;
  platform: 'mobile' | 'web' | null;
  created_at: string;
  updated_at: string;
}

export type MobileOs = 'ios' | 'android';

export interface ScreenFamily {
  id: string;
  project_id: string;
  name: string;
  group: string | null;
  flow_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WebPreset {
  key: string;
  label: string;
  width: number;
}

export type FigmaRequestStatus = 'queued' | 'parsing' | 'building' | 'review' | 'ready' | 'failed';

export interface CatalogueFigmaRequest {
  id: string;
  project_id: string | null;
  title: string | null;
  html_snippet: string;
  reference_image_url: string | null;
  requested_by_user_id: string;
  requested_by_email: string | null;
  status: FigmaRequestStatus;
  node_url: string | null;
  node_id: string | null;
  file_key: string | null;
  admin_notes: string | null;
  error_message: string | null;
  engine_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CatalogueSettingsRecord {
  user_id: string;
  web_presets: WebPreset[];
  created_at?: string;
  updated_at?: string;
}

export interface ScreenshotNode {
  id: string;
  project_id: string;
  flow_id: string | null;
  screen_family_id: string | null;
  name: string;
  file_name: string;
  storage_path: string;
  image_url?: string;
  sequence: number | null;
  group: string | null;
  platform: 'mobile' | 'web' | null;
  web_preset_key: string | null;
  mobile_os: MobileOs | null;
  theme: 'light' | 'dark' | null;
  reference_url: string | null;
  reference_storage_path: string | null;
  reference_label: string | null;
  version_count?: number;
  comment_count?: number;
  comment_last_added_at?: string | null;
  annotation_count?: number;
  annotation_last_added_at?: string | null;
  position_x: number | null;
  position_y: number | null;
  metadata: Record<string, unknown>;
  thumb_hash?: string | null;
  uploader_user_id?: string | null;
  uploader_email?: string | null;
  suggested_group?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  deleted_by_email?: string | null;
}

export interface Connection {
  id: string;
  project_id: string;
  flow_id: string | null;
  source_id: string;
  target_id: string;
  type: 'auto' | 'manual';
  label: string | null;
  arrow_direction: 'forward' | 'backward' | 'both';
  source_handle: string | null;
  target_handle: string | null;
  created_at?: string;
}

export interface Comparison {
  id: string;
  screenshot_id: string;
  name: string;
  storage_path: string;
  image_url?: string;
  created_at?: string;
}

export interface ScreenshotVersion {
  id: string;
  screenshot_id: string;
  version_number: number;
  storage_path: string;
  file_name: string;
  image_url?: string;
  created_at?: string;
}

export interface ScreenshotComment {
  id: string;
  screenshot_id: string;
  user_email: string;
  text: string;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_email?: string | null;
}

export interface ParsedScreenshotName {
  sequence: number | null;
  group: string | null;
  name: string;
  depth: number;
}

export type FeatureLogStatus = 'planned' | 'reference' | 'shipped';
export type FeatureLogLinkType = 'reference' | 'shipped';

export interface FeatureLog {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: FeatureLogStatus;
  created_at: string;
  updated_at: string;
}

export interface FeatureLogLink {
  id: string;
  feature_id: string;
  screenshot_id: string;
  link_type: FeatureLogLinkType;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureLogSummary extends FeatureLog {
  reference_count: number;
  shipped_count: number;
  total_count: number;
}
