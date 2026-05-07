// Labeling Studio types. Backs `screenshots.metadata.label` JSON.
// Schema mirrors docs/catalogue-ideation-2026-05-06-labeling-studio.md §4
// with the §18.3 provenance additions.

export type LabelStatus = 'unlabeled' | 'draft' | 'needs_review' | 'verified';

export type LabelSource = 'user' | 'ai' | 'import' | 'script';

export interface LabelIdentity {
  title: string;
  one_line_summary: string;
  source_app: string | null;
  product_category: string | null;
  platform: string | null;
  device_type: string | null;
  page_types: string[];
  screen_state: string | null;
}

export interface LabelJourney {
  flow_name: string | null;
  step_name: string | null;
  step_index: number | null;
  screens_count: number | null;
  user_problem: string;
  step_goal: string;
  user_action: string;
  system_response: string;
  previous_step: string | null;
  next_step: string | null;
  inference_notes: string;
}

export interface LabelScreenAnalysis {
  description: string;
  layout: string;
  functions: string;
  ui_elements: string[];
  ux_patterns: string[];
  colors: string[];
  visible_text: string[];
}

export interface LabelVisualDesign {
  theme: string | null;
  density: string | null;
  hierarchy: string;
  typography_notes: string;
  color_notes: string;
  spacing_notes: string;
  style_keywords: string[];
}

export interface LabelDesignReference {
  good_for: string[];
  use_when_designing: string[];
  patterns_to_steal: string[];
  risks_or_anti_patterns: string[];
  avoid_using_when: string[];
  similar_reference_queries: string[];
}

export interface LabelReview {
  label_status: LabelStatus;
  confidence: number | null;
  missing_fields: string[];
  admin_notes: string;
  source: LabelSource;
  source_email: string | null;
  model: string | null;
  prompt_version: string | null;
  vocab_version: string;
}

export interface ScreenshotLabel {
  identity: LabelIdentity;
  journey: LabelJourney;
  screen_analysis: LabelScreenAnalysis;
  visual_design: LabelVisualDesign;
  design_reference: LabelDesignReference;
  review: LabelReview;
}

export type LabelVocabKind =
  | 'platform'
  | 'device_type'
  | 'screen_state'
  | 'theme'
  | 'density'
  | 'page_type'
  | 'ui_element'
  | 'ux_pattern';

export interface LabelVocabEntry {
  id: string;
  kind: LabelVocabKind;
  value: string;
  category: string | null;
  description: string | null;
  synonyms: string[];
  is_active: boolean;
  created_at: string;
}
