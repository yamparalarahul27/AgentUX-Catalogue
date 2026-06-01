import { LABEL_VOCAB_VERSION } from './constants';
import { getScreenshotFlowLabel } from '../catalogue-families';
import type { ScreenshotNode } from '../../types';
import type { ScreenshotLabel } from './types';

interface CreateDefaultLabelArgs {
  userEmail: string | null;
  screenshot?: ScreenshotNode | null;
}

// Map screenshot.platform + mobile_os → label.identity.platform vocab.
// Vocab values: 'web' | 'ios' | 'android' | 'desktop_app' | 'tablet' | 'unknown'.
function deriveIdentityPlatform(screenshot: ScreenshotNode): string | null {
  if (screenshot.platform === 'web') return 'web';
  if (screenshot.platform === 'mobile') {
    if (screenshot.mobile_os === 'ios') return 'ios';
    if (screenshot.mobile_os === 'android') return 'android';
    return null;
  }
  return null;
}

// Best-effort device_type pre-fill. User can refine to 'tablet' / 'responsive_web'.
function deriveDeviceType(screenshot: ScreenshotNode): string | null {
  if (screenshot.platform === 'mobile') return 'mobile';
  if (screenshot.platform === 'web') return 'desktop';
  return null;
}

export function createDefaultLabel({ userEmail, screenshot }: CreateDefaultLabelArgs): ScreenshotLabel {
  const platform = screenshot ? deriveIdentityPlatform(screenshot) : null;
  const deviceType = screenshot ? deriveDeviceType(screenshot) : null;
  const theme = screenshot?.theme ?? null;
  const flowName = screenshot ? getScreenshotFlowLabel(screenshot) : null;

  return {
    identity: {
      title: '',
      one_line_summary: '',
      source_app: null,
      product_category: null,
      platform,
      device_type: deviceType,
      page_types: [],
      screen_state: null,
    },
    journey: {
      flow_name: flowName,
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
      ui_element_anchors: [],
      ux_patterns: [],
      colors: [],
      visible_text: [],
    },
    visual_design: {
      theme,
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
