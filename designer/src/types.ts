export interface Flow {
  id: string;
  name: string;
  platform: 'mobile' | 'web' | null;
  created_at: string;
  updated_at: string;
}

export type MobileOs = 'ios' | 'android';

export interface ScreenFamily {
  id: string;
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

// Stable keys for user-customizable toolbar controls. Kept in sync with
// the migration at supabase/migrations/20260616_catalogue_settings_toolbar_prefs.sql
// and the toolbar render code. Adding a new key here without wiring it
// in the toolbar is harmless (stored but ignored).
export type ToolbarHideableKey =
  | 'sort'
  | 'density_stack'
  | 'density_gallery'
  | 'share'
  | 'save';

export type ToolbarPinnableKey = 'platform' | 'theme';

export interface CatalogueSettingsRecord {
  user_id: string;
  web_presets: WebPreset[];
  toolbar_hidden_keys: ToolbarHideableKey[];
  toolbar_pinned_keys: ToolbarPinnableKey[];
  created_at?: string;
  updated_at?: string;
}

export interface ScreenshotNode {
  id: string;
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
  is_public?: boolean;
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
