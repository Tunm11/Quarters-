import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { parseSupabaseConfig, type SupabaseConfig } from "@/lib/supabase-config";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Parsed once at module load. When configuration is missing or malformed the
 * client stays null: the app shows a configuration error instead of falling
 * back to mock data or a hidden backend.
 */
export const supabaseConfig: SupabaseConfig = parseSupabaseConfig(import.meta.env);

export const supabase: TypedSupabaseClient | null =
  supabaseConfig.status === "configured"
    ? createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
