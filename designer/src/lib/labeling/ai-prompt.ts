// The labelling prompt the user copies into ChatGPT / Claude / etc.
// alongside a screenshot. The AI returns JSON in the schema below; the
// user pastes that back into the Label tab via the "Paste JSON" modal.
//
// Kept here as a single source so the prompt and the schema accepted
// by parseAndDiff (`merge-pasted-label.ts`) can be reviewed together.
export const AI_LABELING_PROMPT = `Analyze the attached UI screenshot and return ONLY valid JSON.
Do not repeat this prompt.
Do not explain your answer.
Do not use markdown.
Do not include text before or after the JSON.
If a field is unknown, use null or [].
Create structured metadata for a design-reference catalogue using this schema:
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
    "description": "",
    "layout": "",
    "functions": "",
    "ui_elements": [],
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
Use these controlled values where possible:
platform: web, ios, android, desktop_app, tablet, unknown
device_type: mobile, desktop, tablet, responsive_web, unknown
screen_state: default, loading, empty, error, success, disabled, selected, expanded, collapsed, modal_open, unknown
theme: light, dark, mixed, unknown
density: sparse, comfortable, compact, dense, unknown
For page_types, ui_elements, and ux_patterns, choose concise design terms.
For colors, use hex values if visually clear, otherwise use color names.
For similar_reference_queries, write 5-8 natural language queries useful for Refero, Mobbin, or an internal catalogue.
For patterns_to_steal, write specific reusable design tactics.
Now label the attached screenshot.`;
