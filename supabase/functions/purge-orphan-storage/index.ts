// purge-orphan-storage
//
// Finds files in the 'screenshots' bucket that no DB row references and
// deletes them. Used to reclaim space after Trash auto-purges hard-delete
// screenshot rows but leave their storage objects behind. Safe to run
// anytime — only removes files with no DB pointer.
//
// Referenced paths come from three columns:
//   - screenshots.storage_path           (active screenshots)
//   - screenshots.reference_storage_path (reference image attachments)
//   - screenshot_versions.storage_path   (version-history files)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKET = 'screenshots';
const DELETE_BATCH = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    // 1. Pull every storage path the DB still references.
    const referenced = new Set<string>();

    const { data: screenshots, error: shotsErr } = await supabase
      .from('screenshots')
      .select('storage_path, reference_storage_path');
    if (shotsErr) throw shotsErr;

    for (const row of screenshots ?? []) {
      if (row.storage_path) referenced.add(row.storage_path);
      if (row.reference_storage_path) referenced.add(row.reference_storage_path);
    }

    const { data: versions, error: versionsErr } = await supabase
      .from('screenshot_versions')
      .select('storage_path');
    if (versionsErr) throw versionsErr;

    for (const row of versions ?? []) {
      if (row.storage_path) referenced.add(row.storage_path);
    }

    // 2. List every object in the bucket. Use the raw storage.objects table
    //    rather than the storage API's hierarchical list — the bucket nests
    //    user/project/file paths so the list API would need recursive walking.
    const { data: objects, error: objErr } = await supabase
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', BUCKET);
    if (objErr) throw objErr;

    // 3. Compute the diff.
    const orphans: string[] = [];
    for (const obj of objects ?? []) {
      if (typeof obj.name === 'string' && !referenced.has(obj.name)) {
        orphans.push(obj.name);
      }
    }

    // 4. Delete in batches. Supabase storage.remove() accepts up to ~1000
    //    paths per call but we keep batches small for clearer error reporting.
    let deleted = 0;
    const failures: { path: string; error: string }[] = [];
    for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
      const batch = orphans.slice(i, i + DELETE_BATCH);
      const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) {
        for (const path of batch) failures.push({ path, error: error.message });
        continue;
      }
      deleted += data?.length ?? batch.length;
    }

    return json({
      bucket_objects: objects?.length ?? 0,
      referenced_count: referenced.size,
      orphans_found: orphans.length,
      deleted,
      failures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}
