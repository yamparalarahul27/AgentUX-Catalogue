// iOS Shortcut upload-token lifecycle — all client-side.
//
// The token is a dedicated, upload-only secret the user pastes into an
// Apple Shortcut so it can POST screenshots / links to the shortcut-upload
// Edge Function. We generate it in the browser, store only its SHA-256
// hash (own-row RLS on public.upload_tokens), and show the plaintext once.
//
// Companion code:
//   - supabase/migrations/20260623_upload_tokens.sql
//   - supabase/functions/shortcut-upload/index.ts
//   - designer/src/components/CatalogueIosUploadModal.tsx

import { supabase } from './supabase';

export interface UploadTokenStatus {
  createdAt: string;
  lastUsedAt: string | null;
}

// utk_<base64url of 32 random bytes>. The prefix is just a human hint in
// the Shortcut; the server only ever sees the hash.
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `utk_${base64url}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Reads the owner's own row (RLS makes it the only visible one).
export async function getTokenStatus(): Promise<UploadTokenStatus | null> {
  const { data, error } = await supabase
    .from('upload_tokens')
    .select('created_at, last_used_at')
    .maybeSingle();
  if (error || !data) return null;
  return { createdAt: data.created_at as string, lastUsedAt: (data.last_used_at as string) ?? null };
}

// Generates a fresh token, upserts its hash, and returns the plaintext
// once. Regenerating overwrites the previous hash and clears last_used_at.
export async function setToken(email: string): Promise<string> {
  const plaintext = generateToken();
  const tokenHash = await sha256Hex(plaintext);
  const { error } = await supabase
    .from('upload_tokens')
    .upsert(
      { email, token_hash: tokenHash, created_at: new Date().toISOString(), last_used_at: null },
      { onConflict: 'email' },
    );
  if (error) throw error;
  return plaintext;
}

export async function revokeToken(email: string): Promise<void> {
  const { error } = await supabase.from('upload_tokens').delete().eq('email', email);
  if (error) throw error;
}
