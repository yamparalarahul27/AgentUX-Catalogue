import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

const UPLOADER_COLUMNS = ['uploader_user_id', 'uploader_email'];

export interface ScreenshotInsertUploader {
  userEmail?: string | null;
  userId: string;
}

interface InsertScreenshotWithUploaderParams {
  supabase: SupabaseClient;
  payload: Record<string, unknown>;
  uploader: ScreenshotInsertUploader;
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function shouldFallbackToLegacyInsert(error: PostgrestError | null) {
  if (!error) return false;
  const searchable = `${error.code || ''} ${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return UPLOADER_COLUMNS.some((column) => searchable.includes(column));
}

export async function insertScreenshotWithUploader({
  supabase,
  payload,
  uploader,
}: InsertScreenshotWithUploaderParams) {
  const uploaderPayload = {
    ...payload,
    uploader_email: normalizeEmail(uploader.userEmail),
    uploader_user_id: uploader.userId || null,
  };

  let result = await supabase
    .from('screenshots')
    .insert(uploaderPayload)
    .select('*')
    .single();

  if (!result.error || !shouldFallbackToLegacyInsert(result.error)) {
    return result;
  }

  result = await supabase
    .from('screenshots')
    .insert(payload)
    .select('*')
    .single();

  return result;
}
