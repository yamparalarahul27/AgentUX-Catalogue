export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ScreenshotNode {
  id: string;
  project_id: string;
  name: string;
  file_name: string;
  storage_path: string;
  image_url?: string;
  sequence: number | null;
  group: string | null;
  position_x: number | null;
  position_y: number | null;
  metadata: Record<string, string>;
  created_at?: string;
}

export interface Connection {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  type: 'auto' | 'manual';
  label: string | null;
  created_at?: string;
}

export interface ParsedScreenshotName {
  sequence: number | null;
  group: string | null;
  name: string;
  depth: number;
}
