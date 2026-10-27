/**
 * Database types for the QUARTERS Supabase project.
 *
 * Status: derived from the version-controlled Phase 2B migrations, not freshly
 * generated from a live database. The Supabase CLI, database URL, management
 * token and service-role key are not available in this workspace, so
 * `supabase gen types` cannot run and the Phase 2B migrations have not been
 * applied. Regenerate with the CLI after they are applied.
 *
 * Write types mirror the client grants, which are narrower than the tables:
 *   profiles          own display_name/avatar_url writes only;
 *   providers         an applicant may insert their own pending application;
 *                     status changes come only from provider_reviews;
 *   provider_reviews  administrators insert decisions (reviewed_by = auth.uid);
 *   listings          approved providers insert/update content + publication;
 *   listing_images    approved providers manage their own listing images;
 *   addresses         approved providers manage their listing address;
 *   administration /
 *   event tables      no client writes at all (`never`); admin operations go
 *                     through admin_apply_listing_action(),
 *                     admin_restore_listing() or triggers; restoration is
 *                     revision-checked and separate from the generic action.
 *
 * Column-level SELECT grants are not expressible in this generated shape, so
 * some Row fields (providers.owner_id, provider_reviews.internal_note,
 * listing_administration.hidden_reason/content_revision/hold_revision,
 * listing_moderation_events.acted_by/review_decision/reviewed_revision and
 * listing_content_events.changed_by) are not selectable through the client table API. Do not
 * use `select("*")` on those tables; select the granted columns explicitly or
 * use an administrator RPC. An applicant reads their own provider row through
 * current_provider_application(), because owner_id is not client-filterable.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          /** Object path in the private avatars bucket, or an absolute URL for legacy rows. */
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          /** Account-level switch read by the saved-room alert triggers. */
          saved_room_alerts: boolean;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
          /** The only notification preference stored on the account. */
          saved_room_alerts?: boolean;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          note: string | null;
          user_id: string;
        };
        /** Trusted service-role/dashboard provisioning only. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      providers: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          kind: Database["public"]["Enums"]["provider_kind"];
          /** Never exposed through the API; no client column grant exists. */
          owner_id: string;
          status: Database["public"]["Enums"]["provider_status"];
          updated_at: string;
        };
        /**
         * A signed-in user may submit their own application, forced to pending
         * by policy. Approvals are provider_reviews rows written by admins.
         */
        Insert: {
          display_name: string;
          kind: Database["public"]["Enums"]["provider_kind"];
          owner_id: string;
          status?: "pending";
        };
        Update: never;
        Relationships: [];
      };
      provider_reviews: {
        Row: {
          created_at: string;
          decision: Database["public"]["Enums"]["provider_status"];
          evidence_references: string[];
          id: number;
          internal_note: string | null;
          provider_id: string;
          provider_note: string | null;
          reviewed_at: string;
          reviewed_by: string | null;
        };
        /** Administrators only; policy requires reviewed_by = auth.uid(). */
        Insert: {
          decision: Database["public"]["Enums"]["provider_status"];
          evidence_references?: string[];
          internal_note?: string | null;
          provider_id: string;
          provider_note?: string | null;
          reviewed_by: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "provider_reviews_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_interests: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          sender_id: string;
          status: Database["public"]["Enums"]["roommate_interest_status"];
          updated_at: string;
        };
        /** Clients only create pending interest rows for themselves. */
        Insert: {
          profile_id: string;
          sender_id: string;
        };
        /**
         * The profile owner writes the decision once; the sender withdraws and
         * re-opens their own pending interest.
         */
        Update: {
          status: "pending" | "withdrawn" | "accepted" | "declined";
        };
        Relationships: [
          {
            foreignKeyName: "roommate_interests_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "roommate_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          profile_id: string;
          sender_id: string;
          /** Thread key: the student who opened the conversation. */
          student_id: string;
          /** When the other participant read it; null while unread. */
          read_at: string | null;
          /** The listing this message shares as a card; null for plain text. */
          shared_listing_id: string | null;
          /**
           * The rooms a shortlist message carries, in saved order. Empty for
           * every other message kind.
           */
          shared_listing_ids: string[];
          /** Object path in the private chat-media bucket; null for text only. */
          image_path: string | null;
          /** Set when the sender rewrote the text; drives the "Edited" label. */
          edited_at: string | null;
          /** Set when the sender withdrew the message for everyone. */
          deleted_at: string | null;
        };
        Insert: {
          body: string;
          profile_id: string;
          sender_id: string;
          student_id: string;
          shared_listing_id?: string | null;
          shared_listing_ids?: string[];
          image_path?: string | null;
        };
        /** Only the recipient may stamp a receipt; bodies stay append-only. */
        Update: {
          read_at: string;
        };
        Relationships: [
          {
            foreignKeyName: "roommate_messages_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "roommate_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_profiles: {
        Row: {
          /** Object path in the private roommate-avatars bucket; read-only for clients. */
          avatar_path: string | null;
          bio: string | null;
          budget_amount: number | null;
          city: string;
          created_at: string;
          currency: string;
          display_name: string;
          /**
           * Mirrored from the owner's verification. NULL when unstated or
           * "prefer not to say", so a filter can never infer it.
           */
          gender: "female" | "male" | null;
          headline: string | null;
          id: string;
          institution: string | null;
          is_discoverable: boolean;
          move_in_date: string | null;
          neighbourhood: string | null;
          /**
           * Derived 1-5 compatibility traits mirrored from the owner's private
           * verification. NULL until the owner verifies.
           */
          tidy_score: number | null;
          sleep_score: number | null;
          social_score: number | null;
          guest_score: number | null;
          routine_score: number | null;
          updated_at: string;
          /** Owning account; NULL only for curated demo rows. */
          user_id: string | null;
        };
        /** Clients may only publish a profile for their own account. */
        Insert: {
          /** Object path in the private roommate-avatars bucket, own folder only. */
          avatar_path?: string | null;
          bio?: string | null;
          budget_amount?: number | null;
          city: string;
          currency?: string;
          display_name: string;
          gender?: "female" | "male" | null;
          headline?: string | null;
          id?: string;
          institution?: string | null;
          is_discoverable?: boolean;
          move_in_date?: string | null;
          neighbourhood?: string | null;
          user_id?: string | null;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string | null;
          budget_amount?: number | null;
          city?: string;
          currency?: string;
          display_name?: string;
          gender?: "female" | "male" | null;
          headline?: string | null;
          institution?: string | null;
          is_discoverable?: boolean;
          move_in_date?: string | null;
          neighbourhood?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "roommate_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_verifications: {
        Row: {
          answers: Json;
          blocked_at: string | null;
          blocked_reason: string | null;
          city: string;
          consent_accuracy_at: string;
          consent_monitoring_at: string;
          created_at: string;
          full_name: string;
          gender: "female" | "male" | "prefer_not_to_say" | null;
          guest_score: number;
          id: string;
          institution: string;
          neighbourhood: string | null;
          phone: string;
          review_note: string | null;
          review_state: "clear" | "flagged" | "under_review";
          reviewed_at: string | null;
          reviewed_by: string | null;
          risk_flags: string[];
          routine_score: number;
          school_email: string | null;
          sleep_score: number;
          social_score: number;
          status: "verified" | "suspended" | "blocked";
          study_level:
            | "100"
            | "200"
            | "300"
            | "400"
            | "500"
            | "postgraduate"
            | "recent_graduate"
            | "other";
          submitted_at: string;
          suspended_at: string | null;
          suspension_reason: string | null;
          tidy_score: number;
          updated_at: string;
          user_id: string;
        };
        /** Never sets standing: status, review fields and risk flags are admin-managed. */
        Insert: {
          answers: Json;
          city: string;
          full_name: string;
          gender?: "female" | "male" | "prefer_not_to_say" | null;
          guest_score: number;
          institution: string;
          neighbourhood?: string | null;
          phone: string;
          routine_score: number;
          school_email?: string | null;
          sleep_score: number;
          social_score: number;
          study_level:
            | "100"
            | "200"
            | "300"
            | "400"
            | "500"
            | "postgraduate"
            | "recent_graduate"
            | "other";
          tidy_score: number;
          user_id: string;
        };
        /** Resubmitting answers only; standing and review columns are not granted. */
        Update: {
          answers?: Json;
          city?: string;
          full_name?: string;
          gender?: "female" | "male" | "prefer_not_to_say" | null;
          guest_score?: number;
          institution?: string;
          neighbourhood?: string | null;
          phone?: string;
          routine_score?: number;
          school_email?: string | null;
          sleep_score?: number;
          social_score?: number;
          study_level?:
            | "100"
            | "200"
            | "300"
            | "400"
            | "500"
            | "postgraduate"
            | "recent_graduate"
            | "other";
          tidy_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "roommate_verifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };      roommate_moderation_events: {
        Row: {
          acted_by: string | null;
          action: "flagged" | "cleared" | "suspended" | "blocked" | "reinstated";
          created_at: string;
          id: number;
          reason: string | null;
          user_id: string;
        };
        /** Administrators write through admin_set_roommate_standing(). */
        Insert: never;
        Update: never;

        Relationships: [];
      };
      roommate_blocks: {
        Row: {
          blocked_display_name: string;
          blocked_profile_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
        };
        /** Only the blocker can create a block; the display name is a snapshot. */
        Insert: {
          blocked_display_name: string;
          blocked_profile_id: string;
          blocker_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "roommate_blocks_blocked_profile_id_fkey";
            columns: ["blocked_profile_id"];
            isOneToOne: false;
            referencedRelation: "roommate_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roommate_blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason:
            | "harassment"
            | "fake_profile"
            | "scam"
            | "inappropriate"
            | "safety"
            | "other";
          reported_profile_id: string;
          reported_user_id: string | null;
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          status: "open" | "reviewing" | "resolved" | "dismissed";
          updated_at: string;
        };
        /** Status and moderation columns are administrator-managed. */
        Insert: {
          details?: string | null;
          reason:
            | "harassment"
            | "fake_profile"
            | "scam"
            | "inappropriate"
            | "safety"
            | "other";
          reported_profile_id: string;
          reporter_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "roommate_reports_reported_profile_id_fkey";
            columns: ["reported_profile_id"];
            isOneToOne: false;
            referencedRelation: "roommate_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roommate_reports_reported_user_id_fkey";
            columns: ["reported_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roommate_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      roommate_verification_appeals: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decision_note: string | null;
          id: string;
          message: string;
          reason: "corrected" | "mistake" | "impersonation" | "other";
          status: "pending" | "approved" | "declined";
          updated_at: string;
          user_id: string;
          verification_id: string;
        };
        /** A student may open one pending re-review request per verification. */
        Insert: {
          message: string;
          reason: "corrected" | "mistake" | "impersonation" | "other";
          user_id: string;
          verification_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "roommate_verification_appeals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roommate_verification_appeals_verification_id_fkey";
            columns: ["verification_id"];
            isOneToOne: false;
            referencedRelation: "roommate_verifications";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_availability_holds: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          listing_id: string;
          note: string | null;
          starts_on: string;
        };
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          listing_id: string;
          note?: string | null;
          starts_on: string;
        };
        Update: {
          ends_on?: string;
          note?: string | null;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_availability_holds_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          listing_id: string;
          reason: Database["public"]["Enums"]["listing_report_reason"];
          reporter_id: string;
          status: Database["public"]["Enums"]["listing_report_status"];
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id: string;
          reason: Database["public"]["Enums"]["listing_report_reason"];
          reporter_id: string;
          status?: Database["public"]["Enums"]["listing_report_status"];
        };
        /** Administrators move the status; nothing else is client-writable. */
        Update: {
          status?: Database["public"]["Enums"]["listing_report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "listing_reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_reviews: {
        Row: {
          /** Not client-readable: reviews are shown without the reviewer. */
          author_id: string;
          basis: Database["public"]["Enums"]["listing_review_basis"];
          body: string;
          created_at: string;
          id: string;
          listing_id: string;
          rating: number;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          basis: Database["public"]["Enums"]["listing_review_basis"];
          body: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          rating: number;
          updated_at?: string;
        };
        /** Only the words and the score can be corrected. */
        Update: {
          body?: string;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_reviews_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"];
          /** One-off agency/commission fee, or null when the provider left it unstated. */
          agency_fee_amount: number | null;
          availability_status: Database["public"]["Enums"]["availability_status"];
          /** Earliest move-in date the provider states (YYYY-MM-DD), or null. */
          available_from: string | null;
          bathrooms: number | null;
          bedrooms: number | null;
          /** Refundable caution/security deposit, or null when not stated. */
          caution_deposit_amount: number | null;
          city: string;
          created_at: string;
          currency: string;
          description: string | null;
          facilities: string[];
          first_published_at: string | null;
          furnishing_status: Database["public"]["Enums"]["furnishing_status"] | null;
          id: string;
          /** When QUARTERS inspected the property, or null when it has not. */
          inspected_at: string | null;
          institution: string | null;
          neighbourhood: string | null;
          property_rules: string[];
          provider_id: string;
          publication_status: Database["public"]["Enums"]["publication_status"];
          rent_amount: number | null;
          rent_period: Database["public"]["Enums"]["rent_period"] | null;
          /** Session length in months when the period alone is vague (9 or 12). */
          rent_session_months: number | null;
          title: string;
          /** Rooms or bed spaces offered. NULL when the provider has not stated it. */
          total_rooms: number | null;
          updated_at: string;
          /** Utilities cost for utilities_period, or null when not stated. */
          utilities_amount: number | null;
          /** How utilities are charged, in the provider's words. */
          utilities_note: string | null;
          utilities_period: Database["public"]["Enums"]["rent_period"] | null;
          /** When QUARTERS verified the listing's details, or null. Moderator-set only. */
          verified_at: string | null;
        };
        Insert: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"];
          availability_status?: Database["public"]["Enums"]["availability_status"];
          bathrooms?: number | null;
          bedrooms?: number | null;
          city: string;
          currency?: string;
          description?: string | null;
          facilities?: string[];
          furnishing_status?: Database["public"]["Enums"]["furnishing_status"] | null;
          institution?: string | null;
          neighbourhood?: string | null;
          property_rules?: string[];
          /** Ownership is fixed at insert and cannot be updated by clients. */
          provider_id: string;
          /** Providers may publish immediately. */
          publication_status?: "draft" | "published";
          rent_amount?: number | null;
          rent_period?: Database["public"]["Enums"]["rent_period"] | null;
          rent_session_months?: number | null;
          title: string;
          total_rooms?: number | null;
          agency_fee_amount?: number | null;
          available_from?: string | null;
          caution_deposit_amount?: number | null;
          utilities_amount?: number | null;
          utilities_note?: string | null;
          utilities_period?: Database["public"]["Enums"]["rent_period"] | null;
        };
        Update: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"];
          availability_status?: Database["public"]["Enums"]["availability_status"];
          bathrooms?: number | null;
          bedrooms?: number | null;
          city?: string;
          currency?: string;
          description?: string | null;
          facilities?: string[];
          furnishing_status?: Database["public"]["Enums"]["furnishing_status"] | null;
          institution?: string | null;
          neighbourhood?: string | null;
          property_rules?: string[];
          publication_status?: "draft" | "published" | "archived";
          rent_amount?: number | null;
          rent_period?: Database["public"]["Enums"]["rent_period"] | null;
          rent_session_months?: number | null;
          title?: string;
          total_rooms?: number | null;
          agency_fee_amount?: number | null;
          available_from?: string | null;
          caution_deposit_amount?: number | null;
          utilities_amount?: number | null;
          utilities_note?: string | null;
          utilities_period?: Database["public"]["Enums"]["rent_period"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "listings_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_addresses: {
        Row: {
          address_line: string;
          created_at: string;
          landmark: string | null;
          listing_id: string;
          updated_at: string;
        };
        Insert: {
          address_line: string;
          landmark?: string | null;
          listing_id: string;
        };
        Update: {
          address_line?: string;
          landmark?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listing_addresses_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: true;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_images: {
        Row: {
          alt_text: string | null;
          created_at: string;
          id: string;
          is_cover: boolean;
          listing_id: string;
          position: number;
          storage_path: string;
        };
        Insert: {
          alt_text?: string | null;
          is_cover?: boolean;
          listing_id: string;
          position?: number;
          storage_path: string;
        };
        Update: {
          alt_text?: string | null;
          is_cover?: boolean;
          position?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_group_visits: {
        Row: {
          created_at: string;
          /** Set when a chat group asked; then roommate_profile_id is null. */
          group_id: string | null;
          id: string;
          listing_id: string;
          /**
           * Everyone going, including requested_by. Filled for a roster visit;
           * may be empty on an older pair or group request.
           */
          member_ids: string[];
          requested_by: string;
          /** Set for the 1:1 case; null when the request belongs to a group. */
          roommate_profile_id: string | null;
        };
        /**
         * Either a student asks a connected roommate, or a group asks for
         * everyone — exactly one of the two targets is set.
         */
        Insert: {
          group_id?: string | null;
          listing_id: string;
          member_ids?: string[];
          requested_by: string;
          roommate_profile_id?: string | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_group_visits_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          /** Object path in the private chat-media bucket, never a URL. */
          image_path: string | null;
          listing_id: string;
          /** When the other participant read it; null until then. */
          read_at: string | null;
          sender_id: string;
          /** Set when the message carries a property card. */
          shared_listing_id: string | null;
          student_id: string;
          /** Set when the sender rewrote the text; drives the "Edited" label. */
          edited_at: string | null;
          /** Set when the sender withdrew the message for everyone. */
          deleted_at: string | null;
        };
        /** Either participant writes as themselves into their own thread. */
        Insert: {
          body: string;
          image_path?: string | null;
          listing_id: string;
          sender_id: string;
          shared_listing_id?: string | null;
          student_id: string;
        };
        /** Only the recipient's read receipt is writable. */
        Update: {
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listing_messages_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_room_bookings: {
        Row: {
          booked_by: string | null;
          booking_group_id: string | null;
          created_at: string;
          id: string;
          listing_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          room_number: number;
          status: Database["public"]["Enums"]["room_reservation_status"];
        };
        /** Holds are opened by the paid booking flow and answered by providers. */
        Insert: never;
        /** Bookings are not editable by clients: a held room stays held. */
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_room_bookings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_viewing_requests: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          note: string | null;
          /** Personal data: no client column grant, only own rows through RLS. */
          requester_id: string;
          scheduled_for: string;
          status: Database["public"]["Enums"]["viewing_request_status"];
          updated_at: string;
        };
        /** Clients may only create a pending request for themselves. */
        Insert: {
          listing_id: string;
          note?: string | null;
          requester_id: string;
          scheduled_for: string;
          status?: "pending";
        };
        /** Clients may only cancel their own pending or confirmed request. */
        Update: {
          status: "cancelled";
        };
        Relationships: [
          {
            foreignKeyName: "listing_viewing_requests_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          href: string | null;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          title: string;
        };
        /** Written only by database triggers; clients cannot insert rows. */
        Insert: never;
        /** Only the read stamp is writable, and only on your own rows. */
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_success_at: string | null;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        /** A browser registers itself after the student grants permission. */
        Insert: {
          auth: string;
          endpoint: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        /** Key material only changes through a fresh subscribe; the sender updates with the service role. */
        Update: never;
        Relationships: [];
      };
      listing_administration: {
        Row: {
          /** Monotonic material-content revision; use review-state RPC to read. */
          content_revision: number;
          created_at: string;
          hidden_at: string | null;
          /** Internal; no client column grant. */
          hidden_by: string | null;
          /** Internal; no client column grant. */
          hidden_reason: string | null;
          /** Revision at the start of the current hold; admin RPC only. */
          hold_revision: number | null;
          listing_id: string;
          moderation_note: string | null;
          moderation_status: Database["public"]["Enums"]["listing_moderation_status"];
          updated_at: string;
          visibility: Database["public"]["Enums"]["listing_visibility"];
        };
        /** Created by trigger; changed only by checked administrative RPCs. */
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_administration_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: true;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_moderation_events: {
        Row: {
          acted_at: string;
          /** Not in the provider column grant; use admin_listing_moderation_history(). */
          acted_by: string | null;
          action: Database["public"]["Enums"]["listing_admin_action"];
          id: number;
          listing_id: string;
          moderation_status: Database["public"]["Enums"]["listing_moderation_status"];
          provider_note: string | null;
          publication_status: Database["public"]["Enums"]["publication_status"];
          reason: string | null;
          /** Restoration review metadata; not in the provider column grant. */
          review_decision: string | null;
          /** Restoration review metadata; not in the provider column grant. */
          reviewed_revision: number | null;
          visibility: Database["public"]["Enums"]["listing_visibility"];
        };
        /** Append-only; generic actions or admin_restore_listing(). */
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_moderation_events_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_publication_events: {
        Row: {
          changed_at: string;
          /** Not in the provider column grant; use admin_listing_publication_history(). */
          changed_by: string | null;
          from_status: Database["public"]["Enums"]["publication_status"];
          id: number;
          listing_id: string;
          to_status: Database["public"]["Enums"]["publication_status"];
        };
        /** Append-only; written by triggers, including the initial publish. */
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_publication_events_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_content_events: {
        Row: {
          changed_at: string;
          /** Not in the provider column grant; use admin_listing_content_history(). */
          changed_by: string | null;
          changed_fields: string[];
          id: number;
          listing_id: string;
          new_values: Json;
          previous_values: Json;
        };
        /** Append-only; written by the listings content trigger. */
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "listing_content_events_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_groups: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        /** Written by create_chat_group(); direct inserts must set the caller. */
        Insert: {
          created_by: string;
          name: string;
        };
        /** Name and avatar change only through the creator-only RPCs. */
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      chat_group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          /** Member-owned read cursor; only the member may move it. */
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
        };
        Update: {
          last_read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "chat_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_group_messages: {
        Row: {
          body: string;
          created_at: string;
          group_id: string;
          id: string;
          /** Object path in the private chat-media bucket, never a URL. */
          image_path: string | null;
          sender_id: string;
          /** Set when the message carries a property card. */
          shared_listing_id: string | null;
          /** Set when the sender rewrote the text; drives the "Edited" label. */
          edited_at: string | null;
          /** Set when the sender withdrew the message for everyone. */
          deleted_at: string | null;
        };
        Insert: {
          body: string;
          group_id: string;
          image_path?: string | null;
          sender_id: string;
          shared_listing_id?: string | null;
        };
        /** Edits and withdrawals go through the message RPCs, not the table. */
        Update: never;
        Relationships: [
          {
            foreignKeyName: "chat_group_messages_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "chat_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_groups: {
        Row: {
          closed_reason: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          id: string;
          listing_id: string;
          room_number: number;
          status: Database["public"]["Enums"]["booking_group_status"];
          total_amount: number;
          updated_at: string;
        };
        /** Written only through create_booking_group(). */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          member_order: number;
          paid_at: string | null;
          share_amount: number;
          status: string;
          user_id: string;
        };
        /** Written by the booking RPCs, never directly. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      booking_receipts: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          group_id: string;
          id: string;
          issued_at: string;
          receipt_number: string;
          renewal_at: string;
          renewal_count: number;
          renewed_at: string | null;
          status: Database["public"]["Enums"]["booking_receipt_status"];
        };
        /** Issued by the provider-approval RPC, never by a client. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      saved_listing_collections: {
        Row: {
          created_at: string;
          id: string;
          /** 1-40 characters, unique per account ignoring case and padding. */
          name: string;
          user_id: string;
        };
        Insert: {
          name: string;
          user_id: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      saved_listings: {
        Row: {
          created_at: string;
          listing_id: string;
          user_id: string;
          /** The folder this saved room sits in; null means Unsorted. */
          collection_id: string | null;
        };
        Insert: {
          listing_id: string;
          user_id: string;
          collection_id?: string | null;
        };
        /** Moving a room between collections is the only edit a saved row accepts. */
        Update: {
          collection_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_listings_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "saved_listing_collections";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          /** The filter sheet's budget band; both null means no budget filter. */
          budget_max: number | null;
          budget_min: number | null;
          /** Explore's room-type shortcut: all, private, shared or hostel. */
          category: "all" | "private" | "shared" | "hostel";
          created_at: string;
          /** Every selected facility must be present on a matching room. */
          facilities: string[];
          id: string;
          /** 1-40 characters; shown in the alert title and the Saved tab. */
          name: string;
          /** Whether a matching room writes an activity row. */
          notify: boolean;
          /** The Explore search box, matched against the listing's text. */
          query: string;
          /** The filter sheet's bedroom counts. */
          bedrooms: number[];
          /** The filter sheet's room types. */
          types: Database["public"]["Enums"]["accommodation_type"][];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget_max?: number | null;
          budget_min?: number | null;
          category?: "all" | "private" | "shared" | "hostel";
          facilities?: string[];
          name: string;
          notify?: boolean;
          query?: string;
          bedrooms?: number[];
          types?: Database["public"]["Enums"]["accommodation_type"][];
          user_id: string;
        };
        Update: {
          budget_max?: number | null;
          budget_min?: number | null;
          category?: "all" | "private" | "shared" | "hostel";
          facilities?: string[];
          name?: string;
          notify?: boolean;
          query?: string;
          bedrooms?: number[];
          types?: Database["public"]["Enums"]["accommodation_type"][];
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      /** Creates or corrects the caller's own review of a listing. */
      save_listing_review: {
        Args: {
          p_basis: Database["public"]["Enums"]["listing_review_basis"];
          p_body: string;
          p_rating: number;
          target_listing_id: string;
        };
        Returns: string;
      };
      /** The caller's review of this listing, or no row when they have none. */
      my_listing_review: {
        Args: { target_listing_id: string };
        Returns: {
          basis: Database["public"]["Enums"]["listing_review_basis"];
          body: string;
          created_at: string;
          id: string;
          rating: number;
          updated_at: string;
        }[];
      };
      /** The evidence the caller has for reviewing a listing; null when none. */
      listing_review_basis: {
        Args: { target_listing_id: string };
        Returns: Database["public"]["Enums"]["listing_review_basis"] | null;
      };
      /** Review count, mean score and star distribution for a published listing. */
      listing_review_summary: {
        Args: { target_listing_id: string };
        Returns: {
          average: number | null;
          five: number | null;
          four: number | null;
          one: number | null;
          three: number | null;
          total: number | null;
          two: number | null;
        }[];
      };
      /** Deletes the caller's account after an explicit DELETE confirmation. */
      delete_own_account: {
        Args: { p_confirm: string };
        Returns: undefined;
      };
      /** Lists the caller's own active Supabase sessions, newest activity first. */
      list_own_sessions: {
        Args: Record<string, never>;
        Returns: {
          created_at: string;
          id: string;
          ip: string | null;
          is_current: boolean;
          last_active_at: string | null;
          user_agent: string | null;
        }[];
      };
      /** Deletes one of the caller's sessions, which revokes its refresh token. */
      revoke_own_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      admin_apply_listing_action: {
        Args: {
          action: Database["public"]["Enums"]["listing_admin_action"];
          provider_note?: string | null;
          reason: string;
          target_listing_id: string;
        };
        Returns: Database["public"]["Enums"]["listing_admin_action"];
      };
      admin_listing_review_state: {
        Args: { target_listing_id: string };
        Returns: {
          content_revision: number;
          held: boolean;
          hold_revision: number | null;
          last_content_change_at: string | null;
          listing_id: string;
          moderation_status: Database["public"]["Enums"]["listing_moderation_status"];
          provider_status: Database["public"]["Enums"]["provider_status"];
          publication_status: Database["public"]["Enums"]["publication_status"];
          publicly_visible: boolean;
          visibility: Database["public"]["Enums"]["listing_visibility"];
        }[];
      };
      admin_listing_content_history: {
        Args: { target_listing_id: string };
        Returns: {
          changed_at: string;
          changed_by: string | null;
          changed_fields: string[];
          id: number;
          listing_id: string;
          new_values: Json;
          previous_values: Json;
        }[];
      };
      admin_restore_listing: {
        Args: {
          provider_note?: string | null;
          reason: string;
          reviewed_revision: number;
          target_listing_id: string;
        };
        Returns: {
          listing_id: string;
          provider_status: Database["public"]["Enums"]["provider_status"];
          publication_status: Database["public"]["Enums"]["publication_status"];
          publicly_visible: boolean;
          visibility: Database["public"]["Enums"]["listing_visibility"];
        }[];
      };
      admin_provider_review_history: {
        Args: { target_provider_id: string };
        Returns: {
          decision: Database["public"]["Enums"]["provider_status"];
          evidence_references: string[];
          id: number;
          internal_note: string | null;
          provider_id: string;
          provider_note: string | null;
          reviewed_at: string;
          reviewed_by: string | null;
        }[];
      };
      admin_provider_application: {
        Args: { target_provider_id: string };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          kind: Database["public"]["Enums"]["provider_kind"];
          owner_display_name: string | null;
          owner_id: string;
          status: Database["public"]["Enums"]["provider_status"];
          updated_at: string;
        }[];
      };
      admin_listing_moderation_history: {
        Args: { target_listing_id: string };
        Returns: {
          acted_at: string;
          acted_by: string | null;
          action: Database["public"]["Enums"]["listing_admin_action"];
          id: number;
          listing_id: string;
          moderation_status: Database["public"]["Enums"]["listing_moderation_status"];
          provider_note: string | null;
          publication_status: Database["public"]["Enums"]["publication_status"];
          reason: string | null;
          review_decision: string | null;
          reviewed_revision: number | null;
          visibility: Database["public"]["Enums"]["listing_visibility"];
        }[];
      };
      admin_listing_publication_history: {
        Args: { target_listing_id: string };
        Returns: {
          changed_at: string;
          changed_by: string | null;
          from_status: Database["public"]["Enums"]["publication_status"];
          id: number;
          listing_id: string;
          to_status: Database["public"]["Enums"]["publication_status"];
        }[];
      };
      can_delete_listing: {
        Args: { target_listing_id: string };
        Returns: boolean;
      };
      can_manage_listing: {
        Args: { target_listing_id: string };
        Returns: boolean;
      };
      can_manage_listing_image: {
        Args: { object_name: string };
        Returns: boolean;
      };
      current_provider_application: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          kind: Database["public"]["Enums"]["provider_kind"];
          status: Database["public"]["Enums"]["provider_status"];
          updated_at: string;
        }[];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_approved_provider_owner: {
        Args: { target_provider_id: string };
        Returns: boolean;
      };
      is_own_listing_image: {
        Args: { object_name: string };
        Returns: boolean;
      };
      is_public_listing: {
        Args: { target_listing_id: string };
        Returns: boolean;
      };
      is_public_listing_image: {
        Args: { object_name: string };
        Returns: boolean;
      };
      owns_listing: {
        Args: { target_listing_id: string };
        Returns: boolean;
      };
      owns_provider: {
        Args: { target_provider_id: string };
        Returns: boolean;
      };
      /** The room the caller holds in this listing, or null. */
      my_listing_room_booking: {
        Args: { target_listing: string };
        Returns: number | null;
      };
      /** Interests sent to profiles the caller owns, with a safe sender label. */
      listing_chat_threads: {
        Args: Record<string, never>;
        Returns: {
          listing_id: string;
          listing_title: string;
          student_id: string;
          student_name: string;
          last_body: string;
          last_message_at: string;
          unread_count: number;
        }[];
      };
      listing_chat_threads_for_student: {
        Args: Record<string, never>;
        Returns: {
          listing_id: string;
          listing_title: string;
          provider_name: string;
          provider_kind: Database["public"]["Enums"]["provider_kind"];
          last_body: string;
          last_message_at: string;
          unread_count: number;
        }[];
      };
      /**
       * Account photo behind each discoverable roommate profile. `owner_id` is
       * null for curated demo rows; `avatar_url` is null for an account with no
       * photo. Exists because `profiles` is own-row only.
       */
      roommate_account_photos: {
        Args: { p_profile_ids: string[] };
        Returns: {
          profile_id: string;
          owner_id: string | null;
          avatar_url: string | null;
        }[];
      };
      roommate_interests_for_owner: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          profile_id: string;
          status: Database["public"]["Enums"]["roommate_interest_status"];
          created_at: string;
          sender_id: string;            sender_display_name: string | null;
          sender_headline: string | null;
          sender_city: string | null;
          sender_avatar_path: string | null;
        }[];
      };
      is_chat_group_member: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      is_booking_group_member: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      roommates_connected: {
        Args: { p_a: string; p_b: string };
        Returns: boolean;
      };
      recalculate_booking_group: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      create_booking_group: {
        Args: {
          p_listing_id: string;
          p_room_number: number;
          p_member_ids: string[];
        };
        Returns: string;
      };
      leave_booking_group: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      pay_booking_share: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      booking_group_info: {
        Args: { p_group_id: string };
        Returns: {
          id: string;
          listing_id: string;
          listing_title: string;
          room_number: number;
          total_amount: number;
          currency: string;
          status: Database["public"]["Enums"]["booking_group_status"];
          created_by: string;
          created_at: string;
          closed_reason: string | null;
        }[];
      };
      listing_taken_rooms: {
        Args: { target_listing: string };
        Returns: number[];
      };
      my_room_reservation: {
        Args: { target_listing: string };
        Returns: {
          room_number: number;
          status: Database["public"]["Enums"]["room_reservation_status"];
          booking_group_id: string | null;
          requested_at: string;
          resolved_at: string | null;
        }[];
      };
      provider_room_reservations: {
        Args: Record<string, never>;
        Returns: {
          reservation_id: string;
          listing_id: string;
          listing_title: string;
          room_number: number;
          requester_name: string;
          status: Database["public"]["Enums"]["room_reservation_status"];
          requested_at: string;
          resolved_at: string | null;
          group_id: string | null;
          group_status: Database["public"]["Enums"]["booking_group_status"] | null;
          total_amount: number | null;
          currency: string | null;
          paid_count: number | null;
          member_count: number | null;
        }[];
      };
      respond_to_room_reservation: {
        Args: { p_reservation_id: string; p_approve: boolean };
        Returns: undefined;
      };
      issue_booking_receipt: {
        Args: { p_group_id: string; p_issued_at?: string };
        Returns: undefined;
      };
      cancel_booking: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      renew_booking: {
        Args: { p_group_id: string };
        Returns: string;
      };
      my_bookings: {
        Args: Record<string, never>;
        Returns: {
          group_id: string;
          receipt_number: string;
          status: Database["public"]["Enums"]["booking_receipt_status"];
          issued_at: string;
          renewal_at: string;
          cancelled_at: string | null;
          renewal_count: number;
          listing_id: string;
          listing_title: string;
          city: string;
          neighbourhood: string | null;
          institution: string | null;
          accommodation_type: Database["public"]["Enums"]["accommodation_type"];
          rent_amount: number;
          rent_period: Database["public"]["Enums"]["rent_period"] | null;
          rent_session_months: number | null;
          total_amount: number;
          currency: string;
          room_number: number;
          group_status: Database["public"]["Enums"]["booking_group_status"];
          paid_count: number;
          member_count: number;
          created_by: string;
        }[];
      };
      booking_group_participants: {
        Args: { p_group_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          status: string;
          share_amount: number;
          paid_at: string | null;
          is_creator: boolean;
          member_order: number;
        }[];
      };
      my_booking_group: {
        Args: { p_listing_id: string };
        Returns: string | null;
      };
      has_chatted_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      /** Everyone the caller has chatted with, newest first. */
      chat_contacts: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          display_name: string;
          kind: string;
        }[];
      };
      /** Creates a group for the caller plus two or more contacts. */
      create_chat_group: {
        Args: { p_name: string; p_member_ids: string[] };
        Returns: string;
      };
      chat_groups_for_me: {
        Args: Record<string, never>;
        Returns: {
          group_id: string;
          name: string;
          created_by: string;
          avatar_path: string | null;
          last_body: string;
          last_message_at: string | null;
          unread_count: number;
          member_names: string;
          member_count: number;
        }[];
      };
      my_reports: {
        Args: Record<string, never>;
        Returns: {
          kind: string;
          report_id: string;
          subject: string | null;
          reason: string;
          status: string;
          created_at: string;
        }[];
      };
      chat_group_members_for_me: {
        Args: { p_group_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          joined_at: string;
          is_creator: boolean;
          /** Null when the member has no roommate profile to report or block. */
          roommate_profile_id: string | null;
        }[];
      };
      add_chat_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      remove_chat_group_member: {
        Args: { p_group_id: string; p_user_id: string };
        Returns: undefined;
      };
      leave_chat_group: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      rename_chat_group: {
        Args: { p_group_id: string; p_name: string };
        Returns: undefined;
      };
      set_chat_group_avatar: {
        Args: { p_group_id: string; p_path: string | null };
        Returns: undefined;
      };
      chat_group_thread: {
        Args: { p_group_id: string };
        Returns: {
          id: string;
          sender_id: string;
          sender_name: string;
          body: string;
          created_at: string;
          shared_listing_id: string | null;
          image_path: string | null;
          edited_at: string | null;
          deleted_at: string | null;
        }[];
      };
      chat_group_readers: {
        Args: { p_group_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          last_read_at: string;
        }[];
      };
      edit_chat_message: {
        Args: { p_kind: string; p_message_id: string; p_body: string };
        Returns: undefined;
      };
      delete_chat_message_for_everyone: {
        Args: { p_kind: string; p_message_id: string };
        Returns: undefined;
      };
      hide_chat_message: {
        Args: { p_kind: string; p_message_id: string };
        Returns: undefined;
      };
      can_see_chat_message: {
        Args: { p_kind: string; p_message_id: string };
        Returns: boolean;
      };
      sent_chat_message: {
        Args: { p_kind: string; p_message_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      accommodation_type:
        | "self_contained"
        | "private_room"
        | "shared_room"
        | "hostel"
        | "apartment";
      availability_status: "available" | "limited" | "unavailable";
      booking_group_status: "collecting" | "paid" | "cancelled";
      booking_receipt_status: "active" | "cancelled";
      room_reservation_status: "requested" | "approved" | "declined";
      furnishing_status: "furnished" | "semi_furnished" | "unfurnished";
      listing_admin_action:
        | "flag"
        | "request_correction"
        | "resolve"
        | "hide"
        | "restore"
        | "archive";
      listing_moderation_status:
        | "none"
        | "flagged"
        | "correction_requested"
        | "resolved";
      listing_report_reason:
        | "scam"
        | "wrong_details"
        | "already_taken"
        | "unreachable"
        | "offensive"
        | "duplicate"
        | "other";
      listing_report_status: "open" | "reviewed" | "dismissed";
      listing_review_basis: "visit" | "reservation";
      listing_visibility: "visible" | "hidden";
      notification_kind:
        | "roommate_interest"
        | "roommate_accepted"
        | "roommate_declined"
        | "visit_requested"
        | "visit_confirmed"
        | "visit_declined"
        | "room_requested"
        | "room_approved"
        | "room_declined"
        | "saved_room_price_changed"
        | "saved_room_availability_changed"
        | "saved_room_available"
        | "saved_search_match"
        | "roommate_blocked"
        | "report_decision"
        | "appeal_decision";
      provider_kind: "landlord" | "agent";
      provider_status: "pending" | "approved" | "rejected" | "suspended";
      publication_status: "draft" | "published" | "archived";
      rent_period: "week" | "month" | "quarter" | "term" | "year";
      roommate_interest_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn";
      viewing_request_status:
        | "pending"
        | "confirmed"
        | "declined"
        | "cancelled"
        | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[
  Extract<keyof Database, "public">
];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (
    DefaultSchemaTableNameOrOptions extends {
      schema: keyof DatabaseWithoutInternals;
    }
      ? keyof (
          DatabaseWithoutInternals[
            DefaultSchemaTableNameOrOptions["schema"]
          ]["Tables"] &
            DatabaseWithoutInternals[
              DefaultSchemaTableNameOrOptions["schema"]
            ]["Views"]
        )
      : never
  ) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (
      DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions["schema"]
      ]["Tables"] &
        DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Views"]
    )[TableName] extends { Row: infer R }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (
        DefaultSchema["Tables"] & DefaultSchema["Views"]
      )
    ? (
        DefaultSchema["Tables"] &
          DefaultSchema["Views"]
      )[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (
    DefaultSchemaTableNameOrOptions extends {
      schema: keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Tables"]
      : never
  ) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[
      DefaultSchemaTableNameOrOptions["schema"]
    ]["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][
        DefaultSchemaTableNameOrOptions
      ] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (
    DefaultSchemaTableNameOrOptions extends {
      schema: keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions["schema"]
        ]["Tables"]
      : never
  ) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[
      DefaultSchemaTableNameOrOptions["schema"]
    ]["Tables"][TableName] extends { Update: infer U }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][
        DefaultSchemaTableNameOrOptions
      ] extends { Update: infer U }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (
    DefaultSchemaEnumNameOrOptions extends {
      schema: keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          DefaultSchemaEnumNameOrOptions["schema"]
        ]["Enums"]
      : never
  ) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[
      DefaultSchemaEnumNameOrOptions["schema"]
    ]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (
    PublicCompositeTypeNameOrOptions extends {
      schema: keyof DatabaseWithoutInternals;
    }
      ? keyof DatabaseWithoutInternals[
          PublicCompositeTypeNameOrOptions["schema"]
        ]["CompositeTypes"]
      : never
  ) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[
      PublicCompositeTypeNameOrOptions["schema"]
    ]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      accommodation_type: [
        "self_contained",
        "private_room",
        "shared_room",
        "hostel",
        "apartment",
      ],
      availability_status: ["available", "limited", "unavailable"],
      furnishing_status: ["furnished", "semi_furnished", "unfurnished"],
      listing_admin_action: [
        "flag",
        "request_correction",
        "resolve",
        "hide",
        "restore",
        "archive",
      ],
      listing_moderation_status: [
        "none",
        "flagged",
        "correction_requested",
        "resolved",
      ],
      listing_report_reason: [
        "scam",
        "wrong_details",
        "already_taken",
        "unreachable",
        "offensive",
        "duplicate",
        "other",
      ],
      listing_report_status: ["open", "reviewed", "dismissed"],
      listing_review_basis: ["visit", "reservation"],
      listing_visibility: ["visible", "hidden"],
      provider_kind: ["landlord", "agent"],
      provider_status: ["pending", "approved", "rejected", "suspended"],
      publication_status: ["draft", "published", "archived"],
      rent_period: ["week", "month", "quarter", "term", "year"],
      roommate_interest_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
      ],
      viewing_request_status: [
        "pending",
        "confirmed",
        "declined",
        "cancelled",
        "completed",
      ],
    },
  },
} as const;

export type ProfileRow = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;

export type AdminUserRow = Tables<"admin_users">;
export type ProviderRow = Tables<"providers">;
export type ProviderInsert = TablesInsert<"providers">;
export type ProviderReviewRow = Tables<"provider_reviews">;
export type ProviderReviewInsert = TablesInsert<"provider_reviews">;

export type ListingRow = Tables<"listings">;
export type ListingInsert = TablesInsert<"listings">;
export type ListingUpdate = TablesUpdate<"listings">;
export type ListingAddressRow = Tables<"listing_addresses">;
export type ListingAddressInsert = TablesInsert<"listing_addresses">;
export type ListingImageRow = Tables<"listing_images">;
export type ListingImageInsert = TablesInsert<"listing_images">;
export type ListingViewingRequestRow = Tables<"listing_viewing_requests">;
export type ListingViewingRequestInsert = TablesInsert<"listing_viewing_requests">;
export type RoommateProfileRow = Tables<"roommate_profiles">;
export type RoommateVerificationRow = Tables<"roommate_verifications">;
export type RoommateVerificationInsert = TablesInsert<"roommate_verifications">;
export type RoommateVerificationUpdate = TablesUpdate<"roommate_verifications">;
export type RoommateModerationEventRow = Tables<"roommate_moderation_events">;
export type RoommateBlockRow = Tables<"roommate_blocks">;
export type RoommateBlockInsert = TablesInsert<"roommate_blocks">;
export type RoommateReportRow = Tables<"roommate_reports">;
export type RoommateReportInsert = TablesInsert<"roommate_reports">;
export type RoommateVerificationAppealRow =
  Tables<"roommate_verification_appeals">;
export type RoommateVerificationAppealInsert =
  TablesInsert<"roommate_verification_appeals">;
export type RoommateInterestRow = Tables<"roommate_interests">;
export type RoommateMessageRow = Tables<"roommate_messages">;
export type SavedListingCollectionRow = Tables<"saved_listing_collections">;
export type SavedSearchRow = Tables<"saved_searches">;
export type SavedSearchInsert = TablesInsert<"saved_searches">;
export type SavedSearchUpdate = TablesUpdate<"saved_searches">;
export type ListingAdministrationRow = Tables<"listing_administration">;
export type ListingAvailabilityHoldRow = Tables<"listing_availability_holds">;
export type ListingAvailabilityHoldInsert =
  TablesInsert<"listing_availability_holds">;
export type ListingReportRow = Tables<"listing_reports">;
export type ListingReportInsert = TablesInsert<"listing_reports">;
export type ListingReviewRow = Tables<"listing_reviews">;
export type ListingReviewInsert = TablesInsert<"listing_reviews">;
export type ListingModerationEventRow = Tables<"listing_moderation_events">;
export type ListingPublicationEventRow = Tables<"listing_publication_events">;
export type ListingContentEventRow = Tables<"listing_content_events">;
