// Centralized compile-time feature flags. Flip a constant here and redeploy.

// Pin (point) annotations: legacy. New annotations are areas (drag-to-draw).
// Flip to true if you need to re-enable click-to-place pins in the lightbox.
export const PIN_ANNOTATIONS_ENABLED = false;

// Annotations are an editing surface — disabled below this viewport width.
// Existing annotations still render read-only.
export const ANNOTATION_EDIT_MIN_VIEWPORT_PX = 720;

// Catalogue group chip strip + hybrid toolbar. While off, the legacy Group ▾
// dropdown stays in the toolbar. Flip on per-account for dogfood, then default-on.
export const CATALOGUE_CHIP_STRIP_ENABLED = true;

// Recency dot threshold for chip strip. Placeholder until Phase 0 data review.
export const CATALOGUE_CHIP_RECENCY_HOURS = 24;
