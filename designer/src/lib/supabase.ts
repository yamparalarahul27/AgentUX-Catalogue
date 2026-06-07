import { createClient } from '@supabase/supabase-js';

import { reportFetchFailure, reportFetchSuccess } from './network-status';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. ' +
    'Create a .env file in designer/ with these values from your Supabase project.'
  );
}

// Wrap the default fetch so every Supabase call reports success / failure
// to the network-status tracker. The tracker turns repeated failures into
// the 'unstable' state surfaced by the floating offline indicator.
//
// 4xx responses are NOT counted as failures — those are application-level
// errors (auth, validation, RLS) and don't say anything about the
// connection. Only network-thrown errors and 5xx responses count.
async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, init);
    if (response.status >= 500) {
      reportFetchFailure();
    } else {
      reportFetchSuccess();
    }
    return response;
  } catch (err) {
    reportFetchFailure();
    throw err;
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    global: {
      fetch: trackedFetch,
    },
  },
);
