export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      draft_publications: {
        Row: {
          id: number;
          result: Json;
          version: number;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: number;
          result: Json;
          version?: number;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          id?: number;
          result?: Json;
          version?: number;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
      applications: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          idempotency_key: string;
          regulation_version_id: string | null;
          reject_reason: string | null;
          roster_snapshot: Json;
          status: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          idempotency_key: string;
          regulation_version_id?: string | null;
          reject_reason?: string | null;
          roster_snapshot?: Json;
          status?: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          idempotency_key?: string;
          regulation_version_id?: string | null;
          reject_reason?: string | null;
          roster_snapshot?: Json;
          status?: Database["public"]["Enums"]["application_status"];
          submitted_by?: string;
          team_id?: string;
          tournament_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_regulation_version_id_fkey";
            columns: ["regulation_version_id"];
            isOneToOne: false;
            referencedRelation: "regulation_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: number;
          reason: string | null;
          tournament_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: never;
          reason?: string | null;
          tournament_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: never;
          reason?: string | null;
          tournament_id?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          created_at: string;
          id: string;
          idx: number;
          name: string;
          team_ids: string[];
          tournament_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idx: number;
          name?: string;
          team_ids?: string[];
          tournament_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          idx?: number;
          name?: string;
          team_ids?: string[];
          tournament_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          created_at: string;
          group_id: string | null;
          id: string;
          legacy_id: string | null;
          next_match_id: string | null;
          next_match_slot: string | null;
          round: number;
          scheduled_at: string | null;
          score_a: number | null;
          score_b: number | null;
          slot: number;
          stage: Database["public"]["Enums"]["match_stage"];
          team_a_id: string | null;
          team_b_id: string | null;
          tournament_id: string;
          updated_at: string;
          version: number;
          winner_id: string | null;
        };
        Insert: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          legacy_id?: string | null;
          next_match_id?: string | null;
          next_match_slot?: string | null;
          round?: number;
          scheduled_at?: string | null;
          score_a?: number | null;
          score_b?: number | null;
          slot?: number;
          stage: Database["public"]["Enums"]["match_stage"];
          team_a_id?: string | null;
          team_b_id?: string | null;
          tournament_id: string;
          updated_at?: string;
          version?: number;
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          group_id?: string | null;
          id?: string;
          legacy_id?: string | null;
          next_match_id?: string | null;
          next_match_slot?: string | null;
          round?: number;
          scheduled_at?: string | null;
          score_a?: number | null;
          score_b?: number | null;
          slot?: number;
          stage?: Database["public"]["Enums"]["match_stage"];
          team_a_id?: string | null;
          team_b_id?: string | null;
          tournament_id?: string;
          updated_at?: string;
          version?: number;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_next_match_id_fkey";
            columns: ["next_match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_team_a_id_fkey";
            columns: ["team_a_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_team_b_id_fkey";
            columns: ["team_b_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      placements: {
        Row: {
          created_at: string;
          id: string;
          place: number;
          points: number;
          team_id: string;
          team_name: string;
          tournament_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          place: number;
          points?: number;
          team_id: string;
          team_name?: string;
          tournament_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          place?: number;
          points?: number;
          team_id?: string;
          team_name?: string;
          tournament_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "placements_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      points_ledger: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          points: number;
          reason: string;
          reverses_entry_id: string | null;
          team_id: string;
          tournament_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          points: number;
          reason?: string;
          reverses_entry_id?: string | null;
          team_id: string;
          tournament_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          points?: number;
          reason?: string;
          reverses_entry_id?: string | null;
          team_id?: string;
          tournament_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "points_ledger_reverses_entry_id_fkey";
            columns: ["reverses_entry_id"];
            isOneToOne: true;
            referencedRelation: "points_ledger";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "points_ledger_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "points_ledger_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string;
          created_at: string;
          discord_global_name: string;
          discord_id: string | null;
          discord_username: string;
          id: string;
          looking_for_team: boolean;
          mmr: number | null;
          nickname: string;
          profile_url: string;
          role_position: string;
          team_name: string;
          team_role: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          discord_global_name?: string;
          discord_id?: string | null;
          discord_username?: string;
          id: string;
          looking_for_team?: boolean;
          mmr?: number | null;
          nickname?: string;
          profile_url?: string;
          role_position?: string;
          team_name?: string;
          team_role?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          discord_global_name?: string;
          discord_id?: string | null;
          discord_username?: string;
          id?: string;
          looking_for_team?: boolean;
          mmr?: number | null;
          nickname?: string;
          profile_url?: string;
          role_position?: string;
          team_name?: string;
          team_role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      regulation_versions: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          effective_from: string | null;
          id: string;
          published_at: string | null;
          regulation_id: string;
          status: Database["public"]["Enums"]["regulation_status"];
          updated_at: string;
          version: number;
        };
        Insert: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          effective_from?: string | null;
          id?: string;
          published_at?: string | null;
          regulation_id: string;
          status?: Database["public"]["Enums"]["regulation_status"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          effective_from?: string | null;
          id?: string;
          published_at?: string | null;
          regulation_id?: string;
          status?: Database["public"]["Enums"]["regulation_status"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "regulation_versions_regulation_id_fkey";
            columns: ["regulation_id"];
            isOneToOne: false;
            referencedRelation: "regulations";
            referencedColumns: ["id"];
          },
        ];
      };
      regulations: {
        Row: {
          created_at: string;
          id: string;
          singleton: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          singleton?: boolean;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          singleton?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_captains: {
        Row: {
          created_at: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_captains_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_invitations: {
        Row: {
          id: string;
          team_id: string;
          invited_user_id: string;
          invited_by: string;
          status: "pending" | "accepted" | "declined" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          invited_user_id: string;
          invited_by: string;
          status?: "pending" | "accepted" | "declined" | "cancelled";
          created_at?: string;
        };
        Update: { status?: "pending" | "accepted" | "declined" | "cancelled" };
        Relationships: [];
      };
      team_members: {
        Row: {
          created_at: string;
          id: string;
          mmr: number | null;
          roster_slot: "main" | "reserve";
          roster_place: number;
          nickname: string;
          position: number;
          profile_id: string;
          role: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mmr?: number | null;
          roster_slot?: "main" | "reserve";
          roster_place?: number;
          nickname: string;
          position?: number;
          profile_id?: string | null;
          role?: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mmr?: number | null;
          roster_slot?: "main" | "reserve";
          roster_place?: number;
          nickname?: string;
          position?: number;
          profile_id?: string | null;
          role?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          legacy_id: string | null;
          logo_url: string | null;
          name: string;
          owner_id: string;
          tag: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          legacy_id?: string | null;
          logo_url?: string | null;
          name: string;
          owner_id: string;
          tag?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          legacy_id?: string | null;
          logo_url?: string | null;
          name?: string;
          owner_id?: string;
          tag?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      tournament_moderators: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          id: string;
          revoked_at: string | null;
          tournament_id: string;
          user_id: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          tournament_id: string;
          user_id: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          tournament_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_moderators_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      tournament_participants: {
        Row: {
          application_id: string | null;
          created_at: string;
          id: string;
          logo_url: string | null;
          roster_snapshot: Json;
          seed: number | null;
          team_id: string;
          team_name: string;
          team_tag: string;
          tournament_id: string;
        };
        Insert: {
          application_id?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          roster_snapshot?: Json;
          seed?: number | null;
          team_id: string;
          team_name: string;
          team_tag?: string;
          tournament_id: string;
        };
        Update: {
          application_id?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          roster_snapshot?: Json;
          seed?: number | null;
          team_id?: string;
          team_name?: string;
          team_tag?: string;
          tournament_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_participants_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_participants_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      tournaments: {
        Row: {
          cancel_reason: string | null;
          closed_reason: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          format: Database["public"]["Enums"]["tournament_format"];
          id: string;
          image_url: string | null;
          legacy_id: string | null;
          mode: Database["public"]["Enums"]["tournament_mode"];
          prize_amount: number | null;
          prize_currency: string | null;
          prize_tba: boolean;
          registration_closes_at: string | null;
          registration_opens_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["tournament_status"];
          team_limit: number;
          title: string;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          version: number;
          winner_team_id: string | null;
        };
        Insert: {
          cancel_reason?: string | null;
          closed_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          format?: Database["public"]["Enums"]["tournament_format"];
          id?: string;
          image_url?: string | null;
          legacy_id?: string | null;
          mode?: Database["public"]["Enums"]["tournament_mode"];
          prize_amount?: number | null;
          prize_currency?: string | null;
          prize_tba?: boolean;
          registration_closes_at?: string | null;
          registration_opens_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["tournament_status"];
          team_limit?: number;
          title: string;
          updated_at?: string;
          venue_address?: string | null;
          venue_name?: string | null;
          version?: number;
          winner_team_id?: string | null;
        };
        Update: {
          cancel_reason?: string | null;
          closed_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          format?: Database["public"]["Enums"]["tournament_format"];
          id?: string;
          image_url?: string | null;
          legacy_id?: string | null;
          mode?: Database["public"]["Enums"]["tournament_mode"];
          prize_amount?: number | null;
          prize_currency?: string | null;
          prize_tba?: boolean;
          registration_closes_at?: string | null;
          registration_opens_at?: string | null;
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["tournament_status"];
          team_limit?: number;
          title?: string;
          updated_at?: string;
          venue_address?: string | null;
          venue_name?: string | null;
          version?: number;
          winner_team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournaments_winner_team_id_fkey";
            columns: ["winner_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      team_system_version: { Args: Record<string, never>; Returns: number };
      create_team: { Args: { p_name: string; p_tag?: string }; Returns: string };
      manage_team: {
        Args: {
          p_team_id: string;
          p_action: string;
          p_user_id?: string | null;
          p_value?: string | null;
        };
        Returns: undefined;
      };
      create_team_invitation: { Args: { p_team_id: string; p_user_id: string }; Returns: string };
      list_team_invitations: { Args: Record<string, never>; Returns: Json };
      search_team_players: { Args: { p_team_id: string; p_query: string }; Returns: Json };
      respond_team_invitation: { Args: { p_id: string; p_action: string }; Returns: string };
      get_my_discord_identity: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      publish_draft_result: {
        Args: { p_expected_version: number; p_result: Json };
        Returns: Database["public"]["Tables"]["draft_publications"]["Row"];
      };
      assign_moderator: {
        Args: { p_tournament_id: string; p_user_id: string };
        Returns: {
          assigned_at: string;
          assigned_by: string | null;
          id: string;
          revoked_at: string | null;
          tournament_id: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "tournament_moderators";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      change_tournament_status: {
        Args: {
          p_id: string;
          p_new_status: Database["public"]["Enums"]["tournament_status"];
          p_reason?: string;
        };
        Returns: {
          cancel_reason: string | null;
          closed_reason: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          format: Database["public"]["Enums"]["tournament_format"];
          id: string;
          image_url: string | null;
          legacy_id: string | null;
          mode: Database["public"]["Enums"]["tournament_mode"];
          prize_amount: number | null;
          prize_currency: string | null;
          prize_tba: boolean;
          registration_closes_at: string | null;
          registration_opens_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["tournament_status"];
          team_limit: number;
          title: string;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          version: number;
          winner_team_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "tournaments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decide_application: {
        Args: { p_accept: boolean; p_id: string; p_reason?: string };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          idempotency_key: string;
          regulation_version_id: string | null;
          reject_reason: string | null;
          roster_snapshot: Json;
          status: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_draft_tournament: { Args: { p_id: string }; Returns: undefined };
      finish_tournament: {
        Args: { p_id: string; p_placements: Json; p_reason?: string };
        Returns: {
          cancel_reason: string | null;
          closed_reason: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          format: Database["public"]["Enums"]["tournament_format"];
          id: string;
          image_url: string | null;
          legacy_id: string | null;
          mode: Database["public"]["Enums"]["tournament_mode"];
          prize_amount: number | null;
          prize_currency: string | null;
          prize_tba: boolean;
          registration_closes_at: string | null;
          registration_opens_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["tournament_status"];
          team_limit: number;
          title: string;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          version: number;
          winner_team_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "tournaments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      generate_structure: {
        Args: {
          p_confirm_reset?: boolean;
          p_kind: string;
          p_payload: Json;
          p_tournament_id: string;
        };
        Returns: number;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      import_legacy_team: { Args: { p: Json }; Returns: string };
      import_legacy_tournament: { Args: { p: Json }; Returns: Json };
      is_admin: { Args: { _uid: string }; Returns: boolean };
      is_staff_for: {
        Args: { _tournament_id: string; _uid: string };
        Returns: boolean;
      };
      is_team_captain: {
        Args: { _team_id: string; _uid: string };
        Returns: boolean;
      };
      place_points: { Args: { _place: number }; Returns: number };
      propagate_match_winner: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      publish_regulation: {
        Args: { p_effective_from?: string; p_version_id: string };
        Returns: {
          author_id: string | null;
          body: string;
          created_at: string;
          effective_from: string | null;
          id: string;
          published_at: string | null;
          regulation_id: string;
          status: Database["public"]["Enums"]["regulation_status"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "regulation_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reacknowledge_regulation: {
        Args: { p_application_id: string; p_version_id: string };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          idempotency_key: string;
          regulation_version_id: string | null;
          reject_reason: string | null;
          roster_snapshot: Json;
          status: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      revoke_moderator: {
        Args: { p_reason?: string; p_tournament_id: string; p_user_id: string };
        Returns: undefined;
      };
      set_match_schedule: {
        Args: { p_match_id: string; p_reason?: string; p_scheduled_at: string };
        Returns: {
          created_at: string;
          group_id: string | null;
          id: string;
          legacy_id: string | null;
          next_match_id: string | null;
          next_match_slot: string | null;
          round: number;
          scheduled_at: string | null;
          score_a: number | null;
          score_b: number | null;
          slot: number;
          stage: Database["public"]["Enums"]["match_stage"];
          team_a_id: string | null;
          team_b_id: string | null;
          tournament_id: string;
          updated_at: string;
          version: number;
          winner_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "matches";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_match_score: {
        Args: {
          p_match_id: string;
          p_reason?: string;
          p_score_a: number;
          p_score_b: number;
        };
        Returns: {
          created_at: string;
          group_id: string | null;
          id: string;
          legacy_id: string | null;
          next_match_id: string | null;
          next_match_slot: string | null;
          round: number;
          scheduled_at: string | null;
          score_a: number | null;
          score_b: number | null;
          slot: number;
          stage: Database["public"]["Enums"]["match_stage"];
          team_a_id: string | null;
          team_b_id: string | null;
          tournament_id: string;
          updated_at: string;
          version: number;
          winner_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "matches";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"];
          target: string;
        };
        Returns: undefined;
      };
      submit_application: {
        Args: {
          p_idempotency_key: string;
          p_regulation_version_id: string;
          p_team_id: string;
          p_tournament_id: string;
        };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          idempotency_key: string;
          regulation_version_id: string | null;
          reject_reason: string | null;
          roster_snapshot: Json;
          status: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      tournament_is_public: {
        Args: { _tournament_id: string };
        Returns: boolean;
      };
      upsert_tournament: {
        Args: { expected_version?: number; payload: Json };
        Returns: {
          cancel_reason: string | null;
          closed_reason: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          format: Database["public"]["Enums"]["tournament_format"];
          id: string;
          image_url: string | null;
          legacy_id: string | null;
          mode: Database["public"]["Enums"]["tournament_mode"];
          prize_amount: number | null;
          prize_currency: string | null;
          prize_tba: boolean;
          registration_closes_at: string | null;
          registration_opens_at: string | null;
          starts_at: string | null;
          status: Database["public"]["Enums"]["tournament_status"];
          team_limit: number;
          title: string;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          version: number;
          winner_team_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "tournaments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      withdraw_application: {
        Args: { p_id: string };
        Returns: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          idempotency_key: string;
          regulation_version_id: string | null;
          reject_reason: string | null;
          roster_snapshot: Json;
          status: Database["public"]["Enums"]["application_status"];
          submitted_by: string;
          team_id: string;
          tournament_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      write_audit: {
        Args: {
          _action: string;
          _after: Json;
          _before: Json;
          _entity: string;
          _entity_id: string;
          _reason: string;
          _tournament_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
      application_status: "pending" | "accepted" | "rejected" | "withdrawn";
      match_stage: "group" | "playoff";
      regulation_status: "draft" | "published";
      tournament_format: "groups_playoff" | "single_elim" | "round_robin";
      tournament_mode: "online" | "offline";
      tournament_status:
        | "draft"
        | "announced"
        | "registration_open"
        | "registration_closed"
        | "live"
        | "finished"
        | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      application_status: ["pending", "accepted", "rejected", "withdrawn"],
      match_stage: ["group", "playoff"],
      regulation_status: ["draft", "published"],
      tournament_format: ["groups_playoff", "single_elim", "round_robin"],
      tournament_mode: ["online", "offline"],
      tournament_status: [
        "draft",
        "announced",
        "registration_open",
        "registration_closed",
        "live",
        "finished",
        "cancelled",
      ],
    },
  },
} as const;
