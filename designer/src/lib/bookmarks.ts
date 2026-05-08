import { supabase } from './supabase';

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function fetchBookmarkIds(email: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('screenshot_bookmarks')
    .select('screenshot_id')
    .eq('user_email', email);
  return new Set((data ?? []).map((row: { screenshot_id: string }) => row.screenshot_id));
}

export async function addBookmark(email: string, screenshotId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('screenshot_bookmarks')
    .insert({ user_email: email, screenshot_id: screenshotId });
  if (error && !/duplicate key/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeBookmark(email: string, screenshotId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('screenshot_bookmarks')
    .delete()
    .eq('user_email', email)
    .eq('screenshot_id', screenshotId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
