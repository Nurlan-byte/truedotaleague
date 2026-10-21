import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

// Compatibility boundary for the currently deployed schema. Keep the v2 types separate.
type LegacyTeamTables = {
  teams: Omit<Database["public"]["Tables"]["teams"], "Relationships"> & {
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
  team_members: {
    Row: {
      created_at: string;
      id: string;
      mmr: number | null;
      nickname: string;
      position: number;
      profile_id: string | null;
      role: string;
      team_id: string;
      updated_at: string;
    };
    Insert: {
      created_at?: string;
      id?: string;
      mmr?: number | null;
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
};
type LegacyDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "teams" | "team_members" | "team_invites"> & LegacyTeamTables;
  };
};
export const legacySupabase = supabase as unknown as SupabaseClient<LegacyDatabase>;

export const legacyMyTeamsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["league", "legacy-my-teams", userId ?? "guest"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data: caps, error: capsError } = await legacySupabase
        .from("team_captains")
        .select("team_id")
        .eq("user_id", userId);
      if (capsError) throw capsError;
      const capIds = (caps ?? []).map((c) => c.team_id);
      let q = legacySupabase
        .from("teams")
        .select("*, team_members(*), team_captains(user_id)")
        .order("created_at");
      q = capIds.length
        ? q.or(`owner_id.eq.${userId},id.in.(${capIds.join(",")})`)
        : q.eq("owner_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
