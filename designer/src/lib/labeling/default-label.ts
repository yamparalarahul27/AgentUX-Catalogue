import { LABEL_VOCAB_VERSION } from './constants';
import type { ScreenshotLabel } from './types';

interface CreateDefaultLabelArgs {
  userEmail: string | null;
}

export function createDefaultLabel({ userEmail }: CreateDefaultLabelArgs): ScreenshotLabel {
  return {
    identity: {
      title: '',
      one_line_summary: '',
      source_app: null,
      product_category: null,
      platform: null,
      device_type: null,
      page_types: [],
      screen_state: null,
    },
    journey: {
      flow_name: null,
      step_name: null,
      step_index: null,
      screens_count: null,
      user_problem: '',
      step_goal: '',
      user_action: '',
      system_response: '',
      previous_step: null,
      next_step: null,
      inference_notes: '',
    },
    screen_analysis: {
      description: '',
      layout: '',
      functions: '',
      ui_elements: [],
      ux_patterns: [],
      colors: [],
      visible_text: [],
    },
    visual_design: {
      theme: null,
      density: null,
      hierarchy: '',
      typography_notes: '',
      color_notes: '',
      spacing_notes: '',
      style_keywords: [],
    },
    design_reference: {
      good_for: [],
      use_when_designing: [],
      patterns_to_steal: [],
      risks_or_anti_patterns: [],
      avoid_using_when: [],
      similar_reference_queries: [],
    },
    review: {
      label_status: 'draft',
      confidence: null,
      missing_fields: [],
      admin_notes: '',
      source: 'user',
      source_email: userEmail,
      model: null,
      prompt_version: null,
      vocab_version: LABEL_VOCAB_VERSION,
    },
  };
}
