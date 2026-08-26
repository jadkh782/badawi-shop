'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

let client: SupabaseClient | null = null;

/**
 * One client per browser tab.
 *
 * The session lives in a cookie rather than local storage so the server can read it too:
 * that is what lets the Excel export run in a route handler and lets middleware bounce a
 * signed-out visitor before any screen renders.
 */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = supabaseEnv();
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
