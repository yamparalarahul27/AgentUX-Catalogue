/**
 * Catalogue Figma Component Worker
 *
 * Polls `catalogue_figma_requests` and advances jobs:
 * queued -> parsing -> building -> review | failed
 *
 * Usage:
 *   node scripts/figma-component-worker.mjs --once
 *   node scripts/figma-component-worker.mjs
 *
 * Env (loaded from designer/.env, .env, or process):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   FIGMA_WORKER_POLL_MS=8000
 *   FIGMA_WORKER_AUTO_READY=0
 *   FIGMA_WORKER_MAX_JOBS_PER_LOOP=3
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const envFromFiles = await loadEnvFiles([
  join(ROOT, 'designer', '.env'),
  join(ROOT, '.env'),
]);

const env = {
  ...envFromFiles,
  ...process.env,
};

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_API_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const KEY_SOURCE = env.SUPABASE_SERVICE_ROLE_KEY ? 'service-role' : 'anon';
const POLL_MS = toPositiveInt(env.FIGMA_WORKER_POLL_MS, 8000);
const MAX_JOBS_PER_LOOP = toPositiveInt(env.FIGMA_WORKER_MAX_JOBS_PER_LOOP, 3);
const AUTO_READY = String(env.FIGMA_WORKER_AUTO_READY || '').trim() === '1';
const WORKER_NAME = 'catalogue-figma-worker@v1';
const FLOW_LABEL_KEY = 'catalogue_flow_label';

const runOnce = process.argv.includes('--once');
const runSelfTest = process.argv.includes('--self-test');

if (runSelfTest) {
  await runParserSelfTest();
  process.exit(0);
}

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error(
    'Missing Supabase credentials. Provide SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ' +
    '(or fallback VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (runOnce) {
  const processed = await processAvailableJobsOnce();
  console.log(`Worker finished (once). Jobs processed: ${processed}`);
  process.exit(0);
}

console.log(
  `Starting ${WORKER_NAME} (poll=${POLL_MS}ms, maxJobsPerLoop=${MAX_JOBS_PER_LOOP}, key=${KEY_SOURCE})`,
);
for (;;) {
  try {
    const processed = await processAvailableJobsOnce();
    if (processed === 0) {
      await sleep(POLL_MS);
    }
  } catch (error) {
    console.error('[worker] loop error:', getErrorMessage(error));
    await sleep(POLL_MS);
  }
}

async function processAvailableJobsOnce() {
  let processed = 0;

  for (let index = 0; index < MAX_JOBS_PER_LOOP; index += 1) {
    const job = await claimNextQueuedJob();
    if (!job) break;

    processed += 1;
    await processJob(job);
  }

  return processed;
}

async function claimNextQueuedJob() {
  const { data, error } = await supabase
    .from('catalogue_figma_requests')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`claim select failed: ${error.message}`);
  }

  const next = data?.[0];
  if (!next) return null;

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('catalogue_figma_requests')
    .update({
      admin_notes: `Worker picked up request at ${nowIso}`,
      error_message: null,
      status: 'parsing',
      updated_at: nowIso,
    })
    .eq('id', next.id)
    .eq('status', 'queued')
    .select('*')
    .single();

  if (claimError) {
    // Race condition with another worker/process is acceptable.
    return null;
  }

  return claimed;
}

async function processJob(job) {
  const jobId = String(job.id);
  const title = job.title || `request-${jobId.slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  console.log(`[worker] processing ${title} (${jobId})`);

  try {
    const htmlSnippet = String(job.html_snippet || '').trim();
    if (htmlSnippet.length < 20) {
      throw new Error('HTML snippet is too short for parsing.');
    }

    const parseReport = analyzeHtmlSnippet(htmlSnippet);
    const parsePayload = {
      schemaVersion: '1.0',
      stage: 'parsing',
      worker: WORKER_NAME,
      startedAt,
      parseReport,
      source: {
        hasReferenceImage: Boolean(job.reference_image_url),
        projectId: job.project_id || null,
        title: job.title || null,
      },
    };

    await updateJob(jobId, {
      admin_notes: buildProgressNote(parseReport, 'parsing'),
      engine_payload: parsePayload,
      error_message: null,
      status: 'building',
      updated_at: new Date().toISOString(),
    });

    const buildPlan = buildFigmaBuildPlan({
      htmlSnippet,
      parseReport,
      projectId: job.project_id || null,
      projectName: null,
      referenceImageUrl: job.reference_image_url || null,
      requestId: jobId,
      title: job.title || null,
    });

    const completedPayload = {
      ...parsePayload,
      stage: AUTO_READY ? 'ready' : 'review',
      completedAt: new Date().toISOString(),
      figmaBuildPlan: buildPlan,
      handoff: {
        summary:
          'Use figmaBuildPlan.layout + componentCandidates to generate nodes. Attach node_url/node_id/file_key when done.',
        nextStep: AUTO_READY ? 'Auto-marked ready by worker configuration.' : 'Manual review + node link attach required.',
      },
    };

    await updateJob(jobId, {
      admin_notes: buildProgressNote(parseReport, AUTO_READY ? 'ready' : 'review'),
      engine_payload: completedPayload,
      error_message: null,
      status: AUTO_READY ? 'ready' : 'review',
      updated_at: new Date().toISOString(),
    });

    console.log(`[worker] completed ${title} (${jobId}) -> ${AUTO_READY ? 'ready' : 'review'}`);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await updateJob(jobId, {
      admin_notes: `Worker failed for this request. See failure reason.`,
      error_message: errorMessage,
      status: 'failed',
      updated_at: new Date().toISOString(),
    });
    console.error(`[worker] failed ${title} (${jobId}): ${errorMessage}`);
  }
}

async function updateJob(id, patch) {
  const { error } = await supabase
    .from('catalogue_figma_requests')
    .update(patch)
    .eq('id', id);

  if (error) {
    throw new Error(`update failed (${id}): ${error.message}`);
  }
}

function analyzeHtmlSnippet(htmlSnippet) {
  const openingTagMatches = [...htmlSnippet.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)];
  const tagCounts = {};
  const roleCounts = {};
  const dsTokens = new Set();
  const classSignatureCounts = {};

  for (const match of openingTagMatches) {
    const tagName = match[1].toLowerCase();
    const attrChunk = match[2] || '';

    tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;

    const roleValue = getAttribute(attrChunk, 'role');
    if (roleValue) {
      roleCounts[roleValue] = (roleCounts[roleValue] || 0) + 1;
    }

    const classValue = getAttribute(attrChunk, 'class');
    if (classValue) {
      const classNames = classValue
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);

      for (const className of classNames) {
        if (className.includes('ds-')) {
          dsTokens.add(className);
        }
      }

      const signature = `${tagName}|${classNames.sort().join(' ')}`;
      classSignatureCounts[signature] = (classSignatureCounts[signature] || 0) + 1;
    }
  }

  const buttonLabels = [...htmlSnippet.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((match) => stripHtml(match[1]))
    .map((label) => label.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 40);

  const inputHints = [...htmlSnippet.matchAll(/<input\b([^>]*)>/gi)].map((match) => {
    const attrChunk = match[1] || '';
    return {
      placeholder: getAttribute(attrChunk, 'placeholder') || null,
      role: getAttribute(attrChunk, 'role') || null,
      type: getAttribute(attrChunk, 'type') || null,
    };
  });

  const textSample = stripHtml(htmlSnippet)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 90)
    .join(' ');

  const dominantTags = Object.entries(tagCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  const repeatedClassSignatures = Object.entries(classSignatureCounts)
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([signature, count]) => ({
      signature,
      count,
    }));

  const flowLabels = extractFlowHints(htmlSnippet, buttonLabels);

  return {
    buttonLabels,
    dsTokenCount: dsTokens.size,
    dsTokens: [...dsTokens].sort(),
    dominantTags,
    flowLabels,
    inputHints,
    repeatedClassSignatures,
    roleCounts,
    textSample,
    totalOpeningTags: openingTagMatches.length,
  };
}

function buildFigmaBuildPlan(input) {
  const {
    htmlSnippet,
    parseReport,
    projectId,
    projectName,
    referenceImageUrl,
    requestId,
    title,
  } = input;

  const hasDialog = /role\s*=\s*["']dialog["']/i.test(htmlSnippet);
  const hasTable = /role\s*=\s*["']table["']/i.test(htmlSnippet);
  const hasTablist = /role\s*=\s*["']tablist["']/i.test(htmlSnippet);
  const tableRowsEstimate = parseReport.repeatedClassSignatures
    .find((item) => item.signature.startsWith('div|') || item.signature.startsWith('button|'))?.count || 0;

  const layout = [];
  if (hasDialog) layout.push('root-dialog-frame');
  layout.push('vertical-stack-auto-layout');
  if (hasTablist) layout.push('segmented-control-row');
  if (hasTable) layout.push('table-header-and-row-component');
  if (referenceImageUrl) layout.push('overlay-reference-frame');

  const componentCandidates = [
    {
      name: 'SegmentedControl',
      include: hasTablist,
      reason: hasTablist ? 'Detected tablist role with repeated button tabs.' : 'No tablist role detected.',
    },
    {
      name: 'FilterChipButton',
      include: parseReport.buttonLabels.length >= 4,
      reason: parseReport.buttonLabels.length >= 4
        ? 'Multiple compact buttons detected.'
        : 'Insufficient repeated button labels.',
    },
    {
      name: 'MarketTableRow',
      include: hasTable || tableRowsEstimate >= 3,
      reason: hasTable || tableRowsEstimate >= 3
        ? 'Detected table role or repeated row-like signatures.'
        : 'No table/row repetition strong enough.',
    },
  ];

  const qualitySignals = {
    hasReferenceImage: Boolean(referenceImageUrl),
    hasDesignTokens: parseReport.dsTokenCount > 0,
    hasInteractiveRoles: Object.keys(parseReport.roleCounts || {}).length > 0,
    estimatedFidelity: estimateFidelity(parseReport, Boolean(referenceImageUrl)),
  };

  return {
    componentCandidates,
    generatedAt: new Date().toISOString(),
    handoffLabel: title || `Component ${requestId.slice(0, 8)}`,
    layout,
    project: {
      id: projectId,
      name: projectName,
    },
    qualitySignals,
    tokenMappingHints: parseReport.dsTokens.slice(0, 120),
    workerConventions: {
      [FLOW_LABEL_KEY]: parseReport.flowLabels[0] || null,
      outputType: 'editable-figma-node',
      reviewNeeded: true,
    },
  };
}

function estimateFidelity(parseReport, hasReferenceImage) {
  let score = 0.45;
  if (parseReport.dsTokenCount > 20) score += 0.18;
  if (Object.keys(parseReport.roleCounts || {}).length > 2) score += 0.12;
  if (parseReport.repeatedClassSignatures.length > 0) score += 0.08;
  if (hasReferenceImage) score += 0.12;
  return Math.max(0.2, Math.min(0.95, Number(score.toFixed(2))));
}

function extractFlowHints(htmlSnippet, buttonLabels) {
  const hints = new Set();
  const lower = htmlSnippet.toLowerCase();

  if (lower.includes('deposit')) hints.add('Deposit');
  if (lower.includes('withdraw')) hints.add('Withdraw');
  if (lower.includes('market')) hints.add('Market');
  if (lower.includes('trade')) hints.add('Trade');
  if (lower.includes('search')) hints.add('Search');

  for (const label of buttonLabels) {
    const clean = label.replace(/\s+/g, ' ').trim();
    if (clean.length >= 3 && clean.length <= 20) {
      hints.add(clean);
    }
    if (hints.size >= 10) break;
  }

  return [...hints];
}

function getAttribute(attrChunk, attrName) {
  const pattern = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = attrChunk.match(pattern);
  return match ? decodeHtml(match[1]) : null;
}

function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '));
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildProgressNote(parseReport, stage) {
  const tagSummary = parseReport.dominantTags
    .slice(0, 4)
    .map((item) => `${item.tag}:${item.count}`)
    .join(', ');

  const tokenSummary = parseReport.dsTokenCount > 0
    ? `${parseReport.dsTokenCount} design tokens detected`
    : 'No ds tokens detected';

  if (stage === 'parsing') {
    return `Parsing completed. ${tokenSummary}. Dominant tags: ${tagSummary}.`;
  }
  if (stage === 'ready') {
    return `Worker build completed and auto-marked ready. ${tokenSummary}.`;
  }
  return `Worker build plan created. Awaiting review. ${tokenSummary}.`;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown error');
}

async function loadEnvFiles(paths) {
  const merged = {};
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const fileContents = await readFile(path, 'utf-8');
    const pairs = fileContents
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('#'))
      .filter((line) => line.includes('='));

    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=');
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      merged[key] = value;
    }
  }
  return merged;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runParserSelfTest() {
  const sample = `
    <div role="dialog" class="bg-ds-dialog p-ds-4 rounded-ds-dialog">
      <div role="tablist">
        <button>Favorites</button>
        <button>Futures</button>
      </div>
      <input role="searchbox" placeholder="Search"/>
      <div role="table">
        <div role="row"><div role="cell">BTC</div><div role="cell">68,564</div></div>
        <div role="row"><div role="cell">ETH</div><div role="cell">2,089</div></div>
      </div>
    </div>
  `;

  const parseReport = analyzeHtmlSnippet(sample);
  const buildPlan = buildFigmaBuildPlan({
    htmlSnippet: sample,
    parseReport,
    projectId: 'self-test',
    projectName: 'self-test',
    referenceImageUrl: null,
    requestId: 'self-test-1',
    title: 'Self Test',
  });

  console.log(JSON.stringify({ parseReport, buildPlan }, null, 2));
}
