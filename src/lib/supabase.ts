import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : ({} as Record<string, string | undefined>);

const supabaseUrl = viteEnv.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured: boolean =
  Boolean(supabaseUrl) && Boolean(supabaseAnonKey);

export const supabaseClient: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export const supabase: SupabaseClient | null = supabaseClient;
export const supabaseTyped: SupabaseClient<Database> | null =
  supabaseClient as SupabaseClient<Database> | null;
