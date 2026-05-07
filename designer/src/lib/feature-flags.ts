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

// Reupload (replace-with-fresh-file) — hidden once Crop covers the common
// "fix this screenshot" use case. Gates both the lightbox action and the
// card's reupload button. Flip on if reupload becomes useful again.
export const REUPLOAD_ENABLED = false;

// Upload Analytics tab in Team Settings. Hidden by default — flip on if
// the date-wise upload-volume table becomes useful again.
export const TEAM_UPLOAD_ANALYTICS_ENABLED = false;

// Reference image attachments per screenshot (the "Ref" chip on cards,
// reference upload UI in the lightbox inline editor, and reference image
// rendering in gallery view). Off by default. Database fields and stored
// data are untouched — flipping back to true reveals the existing rows.
export const REFERENCE_IMAGES_ENABLED = false;
