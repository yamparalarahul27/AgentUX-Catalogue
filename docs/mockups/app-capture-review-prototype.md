# App Capture Review Prototype

This prototype explores the end-to-end workspace for an App Capture Specialist and the Admin review interface that checks, comments on, and approves captured app journeys.

## Role Coverage

### Capturer

The Capturer is responsible for documenting selected mobile and web applications from signup through key product flows. The prototype supports:

- Reviewing an assignment brief before starting work.
- Capturing screens by app section and user flow.
- Tracking required, optional, missing, and blocked screens.
- Preparing a submission with quality notes and reviewer context.
- Revising work after Admin feedback.

### Admin

The Admin is responsible for reviewing submitted capture work and giving focused feedback. The prototype supports:

- Triage of submitted app captures in a review queue.
- Inspection of individual screens, flows, and quality checks.
- Writing targeted feedback tied to a specific screen and severity.
- Sending a fix request back to the Capturer.
- Approving a completed capture batch after feedback is resolved.

## Prototype Files

### Capturer Flow

- [Capture Workbench](app-capture-specialist-workbench.html)
- [Assignment Brief](capture-01-assignment-brief.html)
- [Capture Session](capture-02-session.html)
- [Submit Review](capture-03-submit-review.html)

### Admin Flow

- [Admin Queue](admin-01-review-queue.html)
- [Screen Review](admin-02-screen-review.html)
- [Feedback Handoff](admin-03-feedback-handoff.html)

## Local File URLs

Use these file URLs to open the prototype directly in a browser:

```text
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/app-capture-specialist-workbench.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/capture-01-assignment-brief.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/capture-02-session.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/capture-03-submit-review.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/admin-01-review-queue.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/admin-02-screen-review.html
file:///Users/yamparalarahul/Desktop/Personal%20Apps/AgentUX-Catalogue/docs/mockups/admin-03-feedback-handoff.html
```

## Suggested Product Shape

The Capturer interface should behave like a production workbench rather than a loose upload form. The core unit is a capture assignment with required flows, screen coverage, device context, blockers, and reviewer feedback.

The Admin interface should be review-first. It should make gaps easy to find, make feedback specific enough to act on, and keep approval blocked until must-fix items are either resolved or explicitly sent back to the Capturer.

## Validation Notes

The HTML prototype was checked for:

- Desktop and mobile rendering.
- No horizontal overflow at a 390px mobile viewport.
- Queue selection and submission state updates.
- Screen-specific feedback creation.
- Feedback handoff from fix request to approval.
- ASCII-only prototype files with no inline style attributes.
