# Catalogue — "Copy to Figma" via clipboard payload

Make AgentUX the **searchable home for editable Figma captures**, not just static screenshots.

> **Status (2026-06-24):** RESEARCH + SPIKE HARNESS ONLY — **no feature code yet.**
> - Path chosen: **Figma clipboard payload** (native layers), over SVG capture.
> - Round-trip premise is **UNVALIDATED** — the spike ([`figma-clipboard-spike.html`](figma-clipboard-spike.html)) has not yet been run on a desktop (iPad can't exercise the clipboard/Figma path reliably).
> - **Next step is the desktop spike**, not the build. Build is gated on it passing + an ASCII sign-off (per `CLAUDE.md` working agreement).

---

## The problem

Today the workflow is:

1. Open a web app (e.g. **Weex → Futures** screen).
2. Run an `html-to-design` capture script → paste into Figma as editable layers.
3. ...later, **the Figma capture is unfindable** — it gets buried among Figma files.

Separately, the same screen gets **screenshotted into AgentUX**, which *is* findable (search, flow/group, Telegram). So the screenshot is the locatable artifact; the editable Figma version is homeless.

**Idea:** capture both at the same moment, store them together, and let AgentUX's search be the index for the editable Figma version too. Search the screenshot → re-paste the Figma.

---

## What we learned (the part that reshapes the plan)

<table>
<tr><th>Claim</th><th>Reality</th></tr>
<tr>
<td>"Convert the screenshot to editable Figma"</td>
<td>❌ Impossible — a screenshot is a raster PNG. Editability must be <b>captured from the live DOM</b>, not recovered from pixels.</td>
</tr>
<tr>
<td>The current <code>html-to-design</code> script gives us a storable artifact</td>
<td>❌ No. It uploads the DOM to Figma's <b>MCP capture endpoint</b> keyed by a one-time <code>captureId</code> that's consumed by an in-flight request. Ephemeral — not redeemable later.</td>
</tr>
<tr>
<td>The "figma meta tag" some sites use for "Copy to Figma"</td>
<td>✅ Real. Figma's clipboard writes <code>text/html</code> containing <code>&lt;!--(figmeta)...--&gt;</code> (base64 JSON) and <code>&lt;!--(figma)...--&gt;</code> (Kiwi-encoded <code>.fig</code> data). Paste in Figma → <b>native editable layers</b>.</td>
</tr>
</table>

References: [figma-clipboard-extractor](https://github.com/JanOstrowka/figma-clipboard-extractor), [Copy Text/Html plugin](https://www.figma.com/community/plugin/1230382562418460458/copy-text-html), [alexharri.com — the web's clipboard](https://alexharri.com/blog/clipboard).

---

## Options considered

| | **SVG capture** | **Figma clipboard payload** ✅ chosen |
|---|---|---|
| **Fidelity** | Approximation — flat text + rects + colors | **Native layers** — it *is* the `.fig` format |
| **Skip assets?** | ✅ Trivial (drop `<image>`) | ❌ Hard — images ride along as fills |
| **Capture step** | One step, straight from the live page | Round-trip: `html-to-design` → copy in Figma → hand to AgentUX |
| **Robustness** | ✅ Standard, durable | ⚠️ Proprietary/undocumented — could break if Figma changes it (stable for years) |
| **Plugin needed?** | No (paste SVG) | No (paste blob) |
| **Build cost** | Capture script + strip rule | Mostly store + re-emit a string — **less new code** |

**Decision:** Figma clipboard payload. It reuses the native layers the user already generates, needs no conversion engine, and is a pure copy-paste UX. The proprietary-format fragility is the accepted risk.

---

## The premise that must hold (the spike)

> Can we capture Figma's clipboard blob, **persist it as plain text**, and later **re-emit it** so a paste in Figma rebuilds the layers?

The risk is not capture (solved) — it's whether a *stored-then-re-emitted* `text/html` blob (HTML comments intact) survives and Figma still accepts it.

[`figma-clipboard-spike.html`](figma-clipboard-spike.html) is a self-contained, repo-free harness that tests exactly this:

1. Copy layers in Figma (`Cmd+C`).
2. Paste into the harness → it captures `text/html`, checks for `(figma)`/`(figmeta)` markers, persists to `localStorage`.
3. Reload → confirms persistence (the "store" half).
4. "Copy to Figma" → writes the blob back via the async Clipboard API.
5. Paste into Figma → **layers should reappear.**

**Run it on a desktop browser (Chrome safest) with Figma desktop/web.** iPad is unreliable for this (the Figma iPad app may not expose `text/html` to the system clipboard).

---

## Proposed shape — PENDING spike + ASCII sign-off (NOT built)

Once the spike passes:

1. **Capture** — extend the existing bookmarklet/script: after `html-to-design`, grab the Figma clipboard blob and POST it to AgentUX attached to the screenshot being uploaded.
2. **Store** — the blob is text; attach it to the screenshot record. Likely a small file in storage + a path reference (mirrors `reference_storage_path`), since the Kiwi payload can be large.
3. **Use** — a **"Copy to Figma"** button in the lightbox action bar (next to Copy Share Link); click → blob on clipboard → paste into Figma.

```
 Lightbox action bar (existing + proposed):
 ┌──────────────────────────────────────────────┐
 │ ✏️Edit  ⤢Crop  🔖Save  🔗Copy link  ⬡Copy→Figma│ ← new
 │ 💬Comments  📍Annotations  🗑Delete            │
 └──────────────────────────────────────────────┘
     Copy→Figma only shows when a blob is attached
```

> Note: the dual-scope screenshot-state rule in `CLAUDE.md` applies — any handler that attaches/clears the Figma blob must update **both** `screenshots` and `fullScopeScreenshots`.

---

## Open questions

- Does the desktop spike pass? (blocking)
- Storage location for the blob — DB text column vs. storage-bucket file. Decide after seeing typical blob sizes from the spike.
- Capture ergonomics — can the existing capture script also grab the Figma clipboard, or is a manual "copy in Figma → paste into AgentUX" step acceptable for v1?
- The README notes Figma tooling was moved to `AgentUX-Others` in April — confirm there's no overlap before building the capture half here.
