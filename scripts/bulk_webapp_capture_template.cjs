/**
 * Template: authenticated webapp -> Figma capture runner
 *
 * Fill CAPTURE_IDS and STATES, then run:
 * node scripts/bulk_webapp_capture_template.cjs
 *
 * Optional env:
 * URL=https://early.bulk.trade
 * PROFILE_DIR=/tmp/bulk-trade-keepalive
 * WIDTHS=1512,720,320
 * KEEP_OPEN=1
 * HEADLESS=0
 * PAUSE_FOR_LOGIN=1
 */
const { chromium } = require('playwright');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const URL = process.env.URL || 'https://example.com';
const PROFILE_DIR = process.env.PROFILE_DIR || '/tmp/webapp-keepalive';
const WIDTHS = (process.env.WIDTHS || '1512,720,320')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);
const KEEP_OPEN = process.env.KEEP_OPEN === '1';
const HEADLESS = process.env.HEADLESS === '1';
const PAUSE_FOR_LOGIN = process.env.PAUSE_FOR_LOGIN === '1';

// Example:
// CAPTURE_IDS[stateKey][width] = '<capture-id>'
const CAPTURE_IDS = {
  // trade: { 1512: '', 720: '', 320: '' },
};

// Ordered capture states
const STATES = [
  // { key: 'trade', prep: async (page, helpers) => { ... } },
];

function endpoint(id) {
  return `https://mcp.figma.com/mcp/capture/${id}/submit`;
}

async function prepareContext(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await context.route('**/*', async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      await route.fulfill({ response, headers });
    } catch {
      await route.continue();
    }
  });
}

async function ensureCaptureHook(page, context) {
  const ready = await page
    .evaluate(() => !!window.figma && typeof window.figma.captureForDesign === 'function')
    .catch(() => false);
  if (ready) return true;

  const resp = await context.request.get('https://mcp.figma.com/mcp/html-to-design/capture.js');
  const scriptText = await resp.text();

  await page.evaluate((script) => {
    const old = document.querySelector('script[data-codex-figma-capture="1"]');
    if (old) old.remove();
    const s = document.createElement('script');
    s.setAttribute('data-codex-figma-capture', '1');
    s.textContent = script;
    document.head.appendChild(s);
  }, scriptText);

  await page.waitForTimeout(800);
  return await page
    .evaluate(() => !!window.figma && typeof window.figma.captureForDesign === 'function')
    .catch(() => false);
}

async function clickByText(page, labels) {
  const arr = Array.isArray(labels) ? labels : [labels];
  for (const label of arr) {
    const ok = await page.evaluate((needle) => {
      const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 20 && r.height > 14 && st.visibility !== 'hidden' && st.display !== 'none';
      };
      const low = needle.toLowerCase();
      const elems = Array.from(document.querySelectorAll('button,[role="button"],[role="tab"],a,div,span'))
        .filter(isVisible)
        .map((el) => ({ el, t: textOf(el), r: el.getBoundingClientRect() }))
        .filter((x) => x.t && x.t.toLowerCase().includes(low))
        .sort((a, b) => a.t.length - b.t.length || a.r.y - b.r.y || a.r.x - b.r.x);
      if (!elems.length) return false;
      const target = elems[0].el.closest('button,[role="button"],[role="tab"],a') || elems[0].el;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    }, label);

    if (ok) {
      await page.waitForTimeout(900);
      return true;
    }
  }
  return false;
}

async function submitCapture(page, captureId) {
  return await page.evaluate(({ captureId, endpointUrl }) => {
    if (!window.figma || typeof window.figma.captureForDesign !== 'function') {
      return { ok: false, reason: 'figma_missing' };
    }
    try {
      window.figma.captureForDesign({ captureId, endpoint: endpointUrl, selector: 'body' });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }, { captureId, endpointUrl: endpoint(captureId) });
}

async function waitForManualLogin(page) {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nmanual_login_required=true');
    console.log(`current_url=${page.url()}`);
    await rl.question('Complete login/challenge in the browser, then press Enter to continue...');
  } finally {
    rl.close();
  }
}

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    channel: 'chrome',
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1512, height: 940 },
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
  });

  await prepareContext(context);

  const page = context.pages()[0] || (await context.newPage());
  console.log(`capture_base_url=${URL}`);
  console.log(`profile_dir=${PROFILE_DIR}`);
  console.log(`widths=${WIDTHS.join(',')}`);
  console.log(`keep_open=${KEEP_OPEN}`);

  const report = [];
  let manualLoginDone = !PAUSE_FOR_LOGIN;
  for (const state of STATES) {
    for (const width of WIDTHS) {
      const captureId = CAPTURE_IDS[state.key]?.[width];
      if (!captureId) throw new Error(`Missing capture ID for ${state.key} @ ${width}`);

      await page.setViewportSize({ width, height: 940 });
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(1200);

      if (!manualLoginDone) {
        await waitForManualLogin(page);
        manualLoginDone = true;
      }

      await state.prep(page, { clickByText });
      const hook = await ensureCaptureHook(page, context);
      const result = await submitCapture(page, captureId);

      report.push({ state: state.key, width, captureId, hook, result, url: page.url() });
      console.log(JSON.stringify(report[report.length - 1]));
      await page.waitForTimeout(1200);
    }
  }

  console.log('capture_run_complete=true');
  console.log(JSON.stringify({ total: report.length }, null, 2));

  if (KEEP_OPEN) {
    console.log('browser_session_left_open=true');
    console.log('close_browser_manually_when_done=true');
    return;
  }

  await context.close();
})();
