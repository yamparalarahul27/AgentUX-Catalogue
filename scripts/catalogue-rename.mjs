/**
 * Catalogue Screenshot Rename Script
 *
 * Run this LOCALLY (not in cloud sandbox) with Claude Code.
 * Requires: .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *
 * Usage:
 *   node scripts/catalogue-rename.mjs
 *
 * What it does:
 *   1. Fetches all screenshots from Supabase
 *   2. Downloads each image to a temp folder
 *   3. Outputs a CSV-like report of current state
 *   4. YOU review and provide rename mappings (or let Claude Code read images)
 *   5. Applies updates to Supabase (name, flow_label, sequence)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env from designer/
const envPath = join(ROOT, 'designer', '.env');
if (!existsSync(envPath)) {
  console.error('Missing designer/.env file. Create it with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const envContent = await readFile(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const eqIndex = line.indexOf('=');
      return [line.slice(0, eqIndex).trim(), line.slice(eqIndex + 1).trim()];
    }),
);

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in designer/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const FLOW_LABEL_KEY = 'catalogue_flow_label';
const TEMP_DIR = join(ROOT, '.tmp-screenshots');

// ---- Step 1: Fetch all screenshots ----

async function fetchScreenshots() {
  console.log('Fetching screenshots from Supabase...');
  const { data, error } = await supabase
    .from('screenshots')
    .select('id, name, file_name, storage_path, image_url, sequence, group, platform, theme, metadata, screen_family_id, project_id')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch screenshots:', error.message);
    process.exit(1);
  }

  console.log(`Found ${data.length} screenshots.`);
  return data;
}

// ---- Step 2: Generate public URLs and download images ----

async function downloadImages(screenshots) {
  await mkdir(TEMP_DIR, { recursive: true });

  console.log(`Downloading images to ${TEMP_DIR}...`);
  let downloaded = 0;
  let skipped = 0;

  for (const screenshot of screenshots) {
    const url = screenshot.image_url
      || (screenshot.storage_path
        ? supabase.storage.from('screenshots').getPublicUrl(screenshot.storage_path).data.publicUrl
        : null);

    if (!url) {
      skipped++;
      continue;
    }

    const ext = screenshot.file_name?.split('.').pop() || 'png';
    const localPath = join(TEMP_DIR, `${screenshot.id}.${ext}`);

    if (existsSync(localPath)) {
      downloaded++;
      continue;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`  Skipped ${screenshot.id}: HTTP ${response.status}`);
        skipped++;
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(localPath, buffer);
      downloaded++;
    } catch (err) {
      console.warn(`  Failed ${screenshot.id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Downloaded: ${downloaded}, Skipped: ${skipped}`);
}

// ---- Step 3: Generate report ----

async function generateReport(screenshots) {
  const reportPath = join(ROOT, '.tmp-screenshots', 'report.tsv');
  const lines = ['ID\tCURRENT_NAME\tFILE_NAME\tGROUP\tFLOW_LABEL\tSEQUENCE\tPLATFORM\tTHEME\tPROJECT_ID'];

  for (const s of screenshots) {
    const flowLabel = s.metadata?.[FLOW_LABEL_KEY] || '';
    lines.push([
      s.id,
      s.name,
      s.file_name,
      s.group || '',
      flowLabel,
      s.sequence ?? '',
      s.platform || '',
      s.theme || '',
      s.project_id,
    ].join('\t'));
  }

  await writeFile(reportPath, lines.join('\n'), 'utf-8');
  console.log(`Report written to ${reportPath}`);
}

// ---- Step 4: Apply rename mappings ----

async function applyMappings(mappingsPath) {
  if (!existsSync(mappingsPath)) {
    console.log(`\nNo mappings file found at: ${mappingsPath}`);
    console.log('Create a TSV file with columns: ID, NEW_NAME, FLOW_LABEL, SEQUENCE');
    console.log('Then re-run with: node scripts/catalogue-rename.mjs --apply');
    return;
  }

  const content = await readFile(mappingsPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('ID'));

  console.log(`Applying ${lines.length} rename mappings...`);
  let success = 0;
  let failed = 0;

  for (const line of lines) {
    const [id, newName, flowLabel, sequenceStr] = line.split('\t').map((s) => s.trim());
    if (!id || !newName) continue;

    const sequence = sequenceStr ? parseInt(sequenceStr, 10) : null;

    // First get current metadata
    const { data: current } = await supabase
      .from('screenshots')
      .select('metadata')
      .eq('id', id)
      .single();

    const metadata = {
      ...(current?.metadata || {}),
      [FLOW_LABEL_KEY]: flowLabel || null,
    };

    const { error } = await supabase
      .from('screenshots')
      .update({
        name: newName,
        metadata,
        sequence: Number.isNaN(sequence) ? null : sequence,
      })
      .eq('id', id);

    if (error) {
      console.warn(`  Failed ${id}: ${error.message}`);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`Done. Success: ${success}, Failed: ${failed}`);
}

// ---- Main ----

const isApply = process.argv.includes('--apply');
const mappingsPath = join(TEMP_DIR, 'mappings.tsv');

if (isApply) {
  await applyMappings(mappingsPath);
} else {
  const screenshots = await fetchScreenshots();
  await downloadImages(screenshots);
  await generateReport(screenshots);

  console.log(`
=============================================
NEXT STEPS:
=============================================

1. Images downloaded to: ${TEMP_DIR}/
   Each file is named {screenshot_id}.{ext}

2. Current state report: ${TEMP_DIR}/report.tsv

3. Ask Claude Code to:
   - Read the images in ${TEMP_DIR}/
   - Identify each screen (flow + screen name + sequence)
   - Generate a mappings file at: ${mappingsPath}

   Format (TSV):
   ID\\tNEW_NAME\\tFLOW_LABEL\\tSEQUENCE
   abc-123\\tSelect Coin\\tDeposit\\t1
   def-456\\tEnter Amount\\tDeposit\\t2

4. Review the mappings file, then run:
   node scripts/catalogue-rename.mjs --apply

=============================================
`);
}
