/**
 * Types for the QUARTERS Supabase schema.
 *
 * This file is still hand-maintained: live regeneration was not possible in the
 * environment that prepared it (no Supabase CLI, database URL, management
 * token, or service-role key). Keep it in sync with the applied migration and
 * regenerate with `supabase gen types typescript` when those credentials are
 * available.
 *
 * The write aliases are deliberately narrower than the table's full column
 * list because the live grants are column-level: inserts may set id,
 * display_name, and avatar_url; updates may set display_name and avatar_url.
 * Do not add id or timestamps to ProfileUpdate, or timestamps to ProfileInsert.
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
};

export type ProfileInsert = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type ProfileUpdate = {
  display_name?: string | null;
  avatar_url?: string | null;
};

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
