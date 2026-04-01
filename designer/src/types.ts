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

export interface ScreenshotNode {
  id: string;
  project_id: string;
  flow_id: string | null;
  name: string;
  file_name: string;
  storage_path: string;
  image_url?: string;
  sequence: number | null;
  group: string | null;
  platform: 'mobile' | 'web' | null;
  theme: 'light' | 'dark' | null;
  reference_url: string | null;
  reference_storage_path: string | null;
  reference_label: string | null;
  version_count?: number;
  comment_count?: number;
  position_x: number | null;
  position_y: number | null;
  metadata: Record<string, string>;
  created_at?: string;
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
}

export interface ParsedScreenshotName {
  sequence: number | null;
  group: string | null;
  name: string;
  depth: number;
}
