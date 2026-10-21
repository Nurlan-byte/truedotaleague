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
    Tables: Omit<Database["public"]["Tables"], "teams" | "team_members" | "team_invites"> &
      LegacyTeamTables;
  };
};
export const legacySupabase = supabase as unknown as SupabaseClient<LegacyDatabase>;

export const TEAM_ASSOCIATED_TEXT =
  "Вы уже связаны с командой как владелец, капитан или участник. Создать ещё одну команду нельзя.";
export const TEAM_ELIGIBILITY_ERROR =
  "Не удалось проверить участие в командах. Повторите проверку перед созданием команды.";

export async function fetchLegacyTeamEligibility(userId: string): Promise<boolean> {
  if (!userId) throw new Error(`!${TEAM_ELIGIBILITY_ERROR}`);
  const results = await Promise.all([
    legacySupabase.from("teams").select("id").eq("owner_id", userId).limit(1),
    legacySupabase.from("team_captains").select("team_id").eq("user_id", userId).limit(1),
    legacySupabase.from("team_members").select("id").eq("profile_id", userId).limit(1),
  ]);
  if (results.some(({ error, data }) => error || data === null))
    throw new Error(`!${TEAM_ELIGIBILITY_ERROR}`);
  return results.every(({ data }) => data?.length === 0);
}

export const legacyTeamEligibilityQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["league", "legacy-team-eligibility", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 0,
    queryFn: () => fetchLegacyTeamEligibility(userId ?? ""),
  });

export async function createLegacyTeam(userId: string, name: string, tag: string) {
  // Always reread associations before INSERT; cached eligibility is only a UI hint.
  // The database guard remains responsible for concurrent requests.
  let eligible: boolean;
  try {
    eligible = await fetchLegacyTeamEligibility(userId);
  } catch {
    throw new Error(`!${TEAM_ELIGIBILITY_ERROR}`);
  }
  if (!eligible) throw new Error(`!${TEAM_ASSOCIATED_TEXT}`);
  const { error } = await legacySupabase
    .from("teams")
    .insert({ name: name.trim(), tag: tag.trim(), owner_id: userId });
  if (
    error &&
    ["team_already_associated", "already_in_team"].some((token) => error.message.includes(token))
  )
    throw new Error(`!${TEAM_ASSOCIATED_TEXT}`);
  if (error?.code === "40001")
    throw new Error("!Данные команды изменились во время создания. Повторите попытку.");
  if (error) throw error;
}

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
