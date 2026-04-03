#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const LOCAL_DOCS_DIR = path.join(ROOT_DIR, 'docs', 'local');
const INVENTORY_PATH = path.join(LOCAL_DOCS_DIR, 'catalogue-action-inventory.json');
const REPORT_PATH = path.join(LOCAL_DOCS_DIR, 'catalogue-quality-report.md');
const ARTIFACT_DIR = path.join(ROOT_DIR, 'output', 'quality');
const DEFAULT_URL = process.env.CATALOGUE_QUALITY_URL || 'http://127.0.0.1:5173/designer/catalogue';
const VIEWPORTS = [
  { name: 'desktop-1512', width: 1512, height: 811 },
  { name: 'tablet-1024', width: 1024, height: 811 },
  { name: 'mobile-720', width: 720, height: 811 },
  { name: 'mobile-320', width: 320, height: 811 },
];

async function main() {
  await fs.mkdir(LOCAL_DOCS_DIR, { recursive: true });
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  const inventory = await readInventory();
  const playwright = await loadPlaywright();
  const summary = {
    generated_at: new Date().toISOString(),
    url: DEFAULT_URL,
    inventory_count: inventory.items.length,
    runtime_enabled: Boolean(playwright),
    viewports: [],
    critical: [],
    findings: [],
  };

  if (!playwright) {
    for (const viewport of VIEWPORTS) {
      summary.viewports.push({
        viewport,
        pass: 0,
        fail: 0,
        blocked: inventory.items.length,
        sampled: 0,
        reason: 'Playwright is not installed. Install with `npm i -D playwright` and run `npx playwright install`.',
      });
    }
    summary.findings.push({
      priority: 'P1',
      title: 'Runtime checks blocked',
      detail: 'Playwright dependency is missing, so clickability/visibility checks were not executed.',
    });
    await writeReport(summary);
    printSummary(summary);
    return;
  }

  const serverReachable = await isUrlReachable(DEFAULT_URL);
  if (!serverReachable) {
    for (const viewport of VIEWPORTS) {
      summary.viewports.push({
        viewport,
        pass: 0,
        fail: 0,
        blocked: inventory.items.length,
        sampled: 0,
        reason: `Target URL is not reachable: ${DEFAULT_URL}`,
      });
    }
    summary.findings.push({
      priority: 'P1',
      title: 'Runtime checks blocked',
      detail: `Start the designer app before running this script. Expected URL: ${DEFAULT_URL}`,
    });
    await writeReport(summary);
    printSummary(summary);
    return;
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const result = await runViewport(browser, inventory.items, viewport);
      summary.viewports.push(result.viewportSummary);
      summary.critical.push(...result.criticalChecks);
      summary.findings.push(...result.findings);
    }
  } finally {
    await browser.close();
  }

  await writeReport(summary);
  printSummary(summary);
}

async function readInventory() {
  try {
    const raw = await fs.readFile(INVENTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) {
      throw new Error('Inventory JSON does not include an items array.');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Missing or invalid inventory at ${path.relative(ROOT_DIR, INVENTORY_PATH)}. Run \`npm run quality:catalogue:inventory\` first. ${message}`,
    );
  }
}

async function loadPlaywright() {
  try {
    const module = await import('playwright');
    return module.default ?? module;
  } catch {
    return null;
  }
}

async function isUrlReachable(url) {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function runViewport(browser, inventoryItems, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const screenshotPath = path.join(ARTIFACT_DIR, `catalogue-${viewport.name}.png`);
  const findings = [];

  try {
    await page.goto(DEFAULT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const sampled = pickSampleItems(inventoryItems, 120);
    let pass = 0;
    let fail = 0;
    let blocked = 0;

    for (const item of sampled) {
      const probe = await probeAction(page, item);
      if (probe.status === 'pass') pass += 1;
      if (probe.status === 'fail') {
        fail += 1;
        findings.push({
          priority: isPrimaryAction(item.action) ? 'P1' : 'P2',
          title: `Action not usable: ${item.action}`,
          detail: `${item.source} [${viewport.width}px] ${probe.reason}`,
        });
      }
      if (probe.status === 'blocked') blocked += 1;
    }

    const criticalChecks = await runCriticalChecks(page, viewport);
    for (const check of criticalChecks) {
      if (check.status === 'fail') {
        findings.push({
          priority: check.priority,
          title: check.name,
          detail: `${check.detail} [${viewport.width}px]`,
        });
      }
    }

    return {
      viewportSummary: {
        viewport,
        pass,
        fail,
        blocked,
        sampled: sampled.length,
        evidence: path.relative(ROOT_DIR, screenshotPath),
      },
      criticalChecks,
      findings,
    };
  } catch (error) {
    const message = toMessage(error);
    return {
      viewportSummary: {
        viewport,
        pass: 0,
        fail: 0,
        blocked: inventoryItems.length,
        sampled: 0,
        reason: message,
      },
      criticalChecks: [blockedCheck(viewport.width, 'Viewport execution', message, 'P1')],
      findings: [{
        priority: 'P1',
        title: `Viewport run blocked (${viewport.width}px)`,
        detail: message,
      }],
    };
  } finally {
    await context.close();
  }
}

function pickSampleItems(items, limit) {
  const seen = new Set();
  const picked = [];

  for (const item of items) {
    const key = `${item.component}|${item.action}|${item.selector_hint}|${item.surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
    if (picked.length >= limit) break;
  }

  return picked;
}

async function probeAction(page, item) {
  const locator = resolveLocator(page, item);
  if (!locator) {
    return { status: 'blocked', reason: 'No resolvable selector hint.' };
  }

  try {
    const count = await locator.count();
    if (count === 0) {
      return { status: 'blocked', reason: 'selector resolved to 0 elements in current state.' };
    }

    const candidate = locator.first();
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) {
      return { status: 'fail', reason: 'element exists but is not visible.' };
    }

    const disabled = await candidate.isDisabled().catch(() => false);
    if (disabled) {
      return { status: 'blocked', reason: 'element is disabled in current state.' };
    }

    await candidate.click({ trial: true, timeout: 1000 }).catch(() => {
      throw new Error('element is not currently clickable.');
    });

    return { status: 'pass', reason: 'visible and clickable.' };
  } catch (error) {
    return { status: 'fail', reason: toMessage(error) };
  }
}

function resolveLocator(page, item) {
  const selectorHint = String(item.selector_hint || '').trim();
  const action = String(item.action || '').trim();
  const ariaLabel = extractAriaLabel(selectorHint);

  if (ariaLabel) {
    return page.getByLabel(ariaLabel);
  }

  if (selectorHint) {
    try {
      return page.locator(selectorHint);
    } catch {
      // fall through
    }
  }

  if (action) {
    return page.getByRole('button', { name: new RegExp(escapeRegExp(action), 'i') });
  }

  return null;
}

function extractAriaLabel(selectorHint) {
  const match = selectorHint.match(/aria-label="([^"]+)"/);
  return match ? match[1] : null;
}

async function runCriticalChecks(page, viewport) {
  return [
    await checkSettingsModal(page, viewport),
    await checkUploadModal(page, viewport),
    await checkDetailsModal(page, viewport),
    await checkLightboxPanel(page, viewport),
  ];
}

async function checkSettingsModal(page, viewport) {
  const trigger = page.locator('.catalogue-header__settings').first();
  if (await trigger.count() === 0) {
    return blockedCheck(viewport.width, 'Settings modal', 'Settings trigger not found.');
  }

  try {
    await trigger.click();
    const modal = page.locator('.catalogue-settings-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 2000 });

    const cancelVisible = await page.getByRole('button', { name: /cancel/i }).first().isVisible().catch(() => false);
    const saveVisible = await page.getByRole('button', { name: /save presets/i }).first().isVisible().catch(() => false);
    const bottomSheetOk = viewport.width > 720 ? true : await isBottomSheet(page, '.catalogue-settings-modal');

    await page.keyboard.press('Escape').catch(() => {});

    if (cancelVisible && saveVisible && bottomSheetOk) {
      return passCheck(viewport.width, 'Settings modal', 'Modal controls are visible and mobile sheet behavior is valid.');
    }

    return failCheck(
      viewport.width,
      'Settings modal',
      `Expected Cancel/Save visible and bottom-sheet=${viewport.width <= 720}.`,
      viewport.width <= 720 ? 'P1' : 'P2',
    );
  } catch (error) {
    return failCheck(viewport.width, 'Settings modal', toMessage(error), 'P1');
  }
}

async function checkUploadModal(page, viewport) {
  const trigger = page.getByRole('button', { name: /^upload$/i }).first();
  if (await trigger.count() === 0) {
    return blockedCheck(viewport.width, 'Upload modal', 'Upload trigger not found.');
  }

  try {
    await trigger.click();
    const modal = page.locator('.catalogue-upload-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 2000 });
    const bottomSheetOk = viewport.width > 720 ? true : await isBottomSheet(page, '.catalogue-upload-modal');
    await page.keyboard.press('Escape').catch(() => {});

    if (bottomSheetOk) {
      return passCheck(viewport.width, 'Upload modal', 'Upload modal opens and follows responsive behavior.');
    }

    return failCheck(
      viewport.width,
      'Upload modal',
      `Responsive behavior check failed. bottomSheet=${bottomSheetOk}.`,
      viewport.width <= 720 ? 'P1' : 'P2',
    );
  } catch (error) {
    return failCheck(viewport.width, 'Upload modal', toMessage(error), 'P1');
  }
}

async function checkDetailsModal(page, viewport) {
  const editTriggers = [
    page.locator('.catalogue-list-action:has-text("Edit")'),
    page.locator('.catalogue-family-card__action:has-text("Edit")'),
    page.locator('.catalogue-family-lightbox__action:has-text("Edit details")'),
  ];

  let trigger = null;
  for (const candidate of editTriggers) {
    if (await candidate.count() > 0) {
      trigger = candidate.first();
      break;
    }
  }

  if (!trigger) {
    return blockedCheck(viewport.width, 'Details modal save action', 'No editable family row/card found in current dataset.');
  }

  try {
    await trigger.click();
    const modal = page.locator('.catalogue-family-details-modal').first();
    await modal.waitFor({ state: 'visible', timeout: 2500 });
    const saveVisible = await page.getByRole('button', { name: /save details/i }).isVisible().catch(() => false);
    const cancelVisible = await page.getByRole('button', { name: /cancel/i }).first().isVisible().catch(() => false);
    const bottomSheetOk = viewport.width > 720 ? true : await isBottomSheet(page, '.catalogue-family-details-modal');
    await page.keyboard.press('Escape').catch(() => {});

    if (saveVisible && cancelVisible && bottomSheetOk) {
      return passCheck(viewport.width, 'Details modal save action', 'Save/Cancel remain visible with responsive layout.');
    }

    return failCheck(
      viewport.width,
      'Details modal save action',
      `Save/Cancel visibility or responsive layout failed. save=${saveVisible} cancel=${cancelVisible} bottomSheet=${bottomSheetOk}.`,
      'P1',
    );
  } catch (error) {
    return failCheck(viewport.width, 'Details modal save action', toMessage(error), 'P1');
  }
}

async function checkLightboxPanel(page, viewport) {
  const previewTriggers = [
    page.locator('.catalogue-family-card__preview'),
    page.locator('.catalogue-list-thumb'),
    page.locator('.catalogue-gallery-preview-media'),
  ];

  let trigger = null;
  for (const candidate of previewTriggers) {
    if (await candidate.count() > 0) {
      trigger = candidate.first();
      break;
    }
  }

  if (!trigger) {
    return blockedCheck(viewport.width, 'Lightbox panel layout', 'No preview trigger found in current dataset.');
  }

  try {
    await trigger.click();
    const lightbox = page.locator('.catalogue-lightbox').first();
    await lightbox.waitFor({ state: 'visible', timeout: 2500 });

    if (viewport.width <= 320) {
      const panel = page.locator('.catalogue-lightbox-comments').first();
      const panelVisible = await panel.isVisible().catch(() => false);
      const panelBottomSheet = panelVisible ? await isBottomSheet(page, '.catalogue-lightbox-comments') : false;
      await page.keyboard.press('Escape').catch(() => {});

      if (panelVisible && panelBottomSheet) {
        return passCheck(viewport.width, 'Lightbox panel layout', '320px lightbox uses fullscreen media with bottom-sheet panel.');
      }
      return failCheck(
        viewport.width,
        'Lightbox panel layout',
        `Expected bottom-sheet side panel at 320px. visible=${panelVisible} bottomSheet=${panelBottomSheet}.`,
        'P1',
      );
    }

    await page.keyboard.press('Escape').catch(() => {});
    return passCheck(viewport.width, 'Lightbox panel layout', 'Lightbox opens and closes normally.');
  } catch (error) {
    return failCheck(viewport.width, 'Lightbox panel layout', toMessage(error), viewport.width <= 320 ? 'P1' : 'P2');
  }
}

async function isBottomSheet(page, selector) {
  const viewport = page.viewportSize();
  if (!viewport) return false;
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return false;

  const widthOk = box.width >= viewport.width * 0.9;
  const bottomOk = box.y + box.height >= viewport.height - 2;
  const topOk = box.y > viewport.height * 0.08;
  return widthOk && bottomOk && topOk;
}

function passCheck(viewport, name, detail) {
  return { viewport, name, status: 'pass', detail, priority: 'P2' };
}

function failCheck(viewport, name, detail, priority) {
  return { viewport, name, status: 'fail', detail, priority };
}

function blockedCheck(viewport, name, detail, priority = 'P2') {
  return { viewport, name, status: 'blocked', detail, priority };
}

function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isPrimaryAction(action) {
  const value = String(action || '').toLowerCase();
  return ['save', 'upload', 'delete', 'assign', 'cancel'].some((token) => value.includes(token));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeReport(summary) {
  const viewportLines = summary.viewports.map((item) => (
    `| ${item.viewport.width}x${item.viewport.height} | ${item.pass} | ${item.fail} | ${item.blocked} | ${item.sampled} | ${item.evidence || item.reason || '—'} |`
  ));

  const criticalLines = summary.critical.map((item) => (
    `| ${item.viewport}px | ${item.name} | ${item.status.toUpperCase()} | ${item.priority} | ${sanitize(item.detail)} |`
  ));

  const findings = dedupeFindings(summary.findings).slice(0, 40);
  const findingLines = findings.length === 0
    ? ['- No failing checks were recorded in this run.']
    : findings.map((item) => `- [${item.priority}] ${item.title}: ${sanitize(item.detail)}`);

  const markdown = [
    '# Catalogue Quality Report',
    '',
    `Generated: ${summary.generated_at}`,
    '',
    `Target URL: ${summary.url}`,
    '',
    `Inventory actions: ${summary.inventory_count}`,
    '',
    `Runtime enabled: ${summary.runtime_enabled ? 'Yes' : 'No (blocked)'}`,
    '',
    '## Viewport Matrix',
    '',
    '| Viewport | Pass | Fail | Blocked | Sampled | Evidence |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...viewportLines,
    '',
    '## Critical Scenarios',
    '',
    '| Viewport | Scenario | Status | Priority | Details |',
    '| --- | --- | --- | --- | --- |',
    ...(criticalLines.length ? criticalLines : ['| — | No critical checks executed. | BLOCKED | P1 | Runtime unavailable |']),
    '',
    '## Findings',
    '',
    ...findingLines,
    '',
    '## Local Next Steps',
    '',
    '- Fix `P1` findings first (hidden controls, modal sheet regressions, non-clickable primary actions).',
    '- Re-run: `npm run quality:catalogue`.',
    '- Run local gates: `npm run typecheck`, `npm run test`, `npm run check:max-lines`.',
    '',
  ].join('\n');

  await fs.writeFile(REPORT_PATH, `${markdown}\n`, 'utf8');
}

function dedupeFindings(findings) {
  const seen = new Set();
  const output = [];
  for (const finding of findings) {
    const key = `${finding.priority}|${finding.title}|${finding.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(finding);
  }
  return output;
}

function sanitize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function printSummary(summary) {
  const pass = summary.viewports.reduce((total, row) => total + row.pass, 0);
  const fail = summary.viewports.reduce((total, row) => total + row.fail, 0);
  const blocked = summary.viewports.reduce((total, row) => total + row.blocked, 0);
  console.log('Catalogue quality run completed.');
  console.log(`Report: ${path.relative(ROOT_DIR, REPORT_PATH)}`);
  console.log(`Totals: pass=${pass}, fail=${fail}, blocked=${blocked}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
