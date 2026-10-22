/**
 * Types for the QUARTERS Supabase schema.
 *
 * This is hand-maintained because the Stage 1 migration has not been applied to
 * the remote project yet, so generated types cannot be produced from it. Keep
 * this file in sync with `supabase/migrations/*.sql`. Once the migration is
 * applied, regenerate with `supabase gen types typescript` and commit the
 * result instead of editing this by hand.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileInsert = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ProfileUpdate = {
  display_name?: string | null;
  avatar_url?: string | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
