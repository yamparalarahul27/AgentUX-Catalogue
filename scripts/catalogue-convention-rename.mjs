/**
 * Rename existing screenshots to convention format.
 * Reads sequence + flow_label + name from Supabase, builds convention name, updates.
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const envPath = join(ROOT, 'designer', '.env');
if (!existsSync(envPath)) {
  console.error('Missing designer/.env');
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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function buildConventionName(sequence, flowLabel, screenName) {
  const slug = screenName.trim().toLowerCase().replace(/\s+/g, '-');
  const flow = flowLabel?.trim().toLowerCase().replace(/\s+/g, '-') || null;
  const parts = [];
  if (sequence !== null && sequence !== undefined && sequence >= 0) {
    parts.push(String(sequence).padStart(2, '0'));
  }
  if (flow) parts.push(flow);
  parts.push(slug);
  return parts.join('-');
}

function isConventionName(name) {
  return /^(\d+-)?[a-z][a-z0-9-]*$/.test(name);
}

// Fetch all screenshots
console.log('Fetching screenshots...');
const { data, error } = await supabase
  .from('screenshots')
  .select('id, name, sequence, metadata')
  .order('created_at', { ascending: true });

if (error) {
  console.error('Failed:', error.message);
  process.exit(1);
}

console.log(`Found ${data.length} screenshots.`);

// Filter to those that need renaming
const toRename = [];
for (const s of data) {
  if (isConventionName(s.name)) continue; // already in convention format
  
  const flowLabel = s.metadata?.catalogue_flow_label || null;
  const conventionName = buildConventionName(s.sequence, flowLabel, s.name);
  
  if (conventionName !== s.name) {
    toRename.push({ id: s.id, currentName: s.name, newName: conventionName });
  }
}

console.log(`${toRename.length} screenshots need convention rename.`);
console.log(`${data.length - toRename.length} already in convention format.\n`);

if (toRename.length === 0) {
  console.log('Nothing to do!');
  process.exit(0);
}

// Show preview
console.log('Preview (first 10):');
for (const r of toRename.slice(0, 10)) {
  console.log(`  "${r.currentName}" → "${r.newName}"`);
}
if (toRename.length > 10) console.log(`  ... and ${toRename.length - 10} more\n`);

// Apply
if (process.argv.includes('--apply')) {
  console.log(`\nApplying ${toRename.length} renames...`);
  let success = 0;
  let failed = 0;

  for (const r of toRename) {
    const { error: updateError } = await supabase
      .from('screenshots')
      .update({ name: r.newName })
      .eq('id', r.id);

    if (updateError) {
      console.warn(`  Failed ${r.id}: ${updateError.message}`);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`Done. Success: ${success}, Failed: ${failed}`);
} else {
  console.log('\nDry run. Add --apply to execute renames.');
}
