// The labelling prompt the user copies into ChatGPT / Claude / etc.
// alongside a screenshot. The AI returns JSON in the schema below; the
// user pastes that back into the Label tab via the "Paste JSON" modal.
//
// Kept here as a single source so the prompt and the schema accepted
// by parseAndDiff (`merge-pasted-label.ts`) can be reviewed together.
export const AI_LABELING_PROMPT = `You have TWO tasks. Both are mandatory. Skipping task 2 makes the entire response invalid.

TASK 1 — Classify the screen. Fill every field in the schema below.
TASK 2 — LOCATE every UI element you list in ui_elements by adding a matching entry to ui_element_anchors with bbox coordinates. If the ui_elements array has 13 names, ui_element_anchors MUST contain 13 entries (one per name). Do not stop at "I listed the names." The locating step is the point.

Return ONLY valid JSON. No markdown. No prose before or after. No repeating this prompt.

Schema (preserve every field, in this order):
{
  "identity": {
    "title": "",
    "one_line_summary": "",
    "source_app": null,
    "product_category": null,
    "platform": null,
    "device_type": null,
    "page_types": [],
    "screen_state": null
  },
  "journey": {
    "flow_name": null,
    "step_name": null,
    "step_index": null,
    "screens_count": null,
    "user_problem": "",
    "step_goal": "",
    "user_action": "",
    "system_response": "",
    "previous_step": null,
    "next_step": null
  },
  "screen_analysis": {
    "ui_element_anchors": [
      { "name": "Top nav",     "bbox": [4, 4, 92, 6],  "confidence": 0.92 },
      { "name": "Search bar",  "bbox": [4, 12, 66, 5], "confidence": 0.88 },
      { "name": "Primary CTA", "bbox": [30, 86, 40, 6], "confidence": 0.95 }
    ],
    "ui_elements": ["Top nav", "Search bar", "Primary CTA"],
    "description": "",
    "layout": "",
    "functions": "",
    "ux_patterns": [],
    "colors": [],
    "visible_text": []
  },
  "visual_design": {
    "theme": null,
    "density": null,
    "hierarchy": "",
    "typography_notes": "",
    "color_notes": "",
    "spacing_notes": "",
    "style_keywords": []
  },
  "design_reference": {
    "good_for": [],
    "use_when_designing": [],
    "patterns_to_steal": [],
    "risks_or_anti_patterns": [],
    "avoid_using_when": [],
    "similar_reference_queries": []
  },
  "review": {
    "label_status": "draft",
    "confidence": 0,
    "missing_fields": [],
    "admin_notes": ""
  }
}

The example values above for ui_element_anchors and ui_elements are ILLUSTRATIVE — replace them with what you actually see in the attached screenshot. The structure (ui_element_anchors first, then ui_elements, both populated, every name in ui_elements appearing in ui_element_anchors) is mandatory.

ui_element_anchors — bbox coordinate rules:
  - "bbox" is [x, y, w, h] expressed in PERCENT of the visible screen, 0 to 100.
  - x = distance from the LEFT edge of the visible screen to the element's left edge (0 = touching the left edge, 100 = at the right edge).
  - y = distance from the TOP edge to the element's top edge.
  - w = the element's width in percent of the screen width.
  - h = the element's height in percent of the screen height.
  - Example: a button centred horizontally near the bottom of a phone screen, taking 40% of the width and 6% of the height, sits roughly at [30, 86, 40, 6].
  - "confidence" is 0.0 to 1.0 — how confident you are about both existence AND location. 0.7 is fine; do not refuse to anchor a real element just because you're not 100% sure of pixel precision.
  - If you genuinely cannot place an element (e.g. tooltip text without a visible host), set "bbox": null but still include the anchor entry with its name. Do not silently omit.
  - Anchor the DOMINANT instance only. Don't enumerate every menu icon if there are 30.
  - Total anchors: aim for 8-15. One per name in ui_elements.

Controlled values:
  platform: web, ios, android, desktop_app, tablet, unknown
  device_type: mobile, desktop, tablet, responsive_web, unknown
  screen_state: default, loading, empty, error, success, disabled, selected, expanded, collapsed, modal_open, unknown
  theme: light, dark, mixed, unknown
  density: sparse, comfortable, compact, dense, unknown

Other guidance:
  - page_types, ui_elements, ux_patterns: concise design terms.
  - colors: hex if clear, otherwise color names.
  - similar_reference_queries: 5-8 natural language queries useful for Refero, Mobbin, or an internal catalogue.
  - patterns_to_steal: specific reusable design tactics.

Final reminder before you respond: ui_elements and ui_element_anchors must BOTH be populated, with the same length and matching names. A response with ui_elements but empty ui_element_anchors is incomplete. A response with non-empty ui_element_anchors where every name also appears in ui_elements is complete. Do not skip the locating step.

Now label the attached screenshot.`;
