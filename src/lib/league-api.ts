import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationStatus } from "@/lib/league";

/** Каталог: турниры + участники + матчи + места (данных лиги немного, грузим одним запросом). */
async function fetchCatalog() {
  {
    {
      const { data, error } = await supabase
        .from("tournaments")
        .select(
          "*, tournament_participants(team_id, team_name, logo_url), matches(id, team_a_id, team_b_id, score_a, score_b, scheduled_at), placements(team_id, team_name, place, points)",
        );
      if (error) throw error;
      return data ?? [];
    }
  }
}
export type CatalogItem = Awaited<ReturnType<typeof fetchCatalog>>[number];
export const catalogQuery = () => queryOptions({ queryKey: ["league", "catalog"], queryFn: fetchCatalog });

async function fetchTournament(id: string) {
  {
    {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*, tournament_participants(*), matches(*), groups(*), placements(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  }
}
export type TournamentDetail = NonNullable<Awaited<ReturnType<typeof fetchTournament>>>;
export const tournamentQuery = (id: string) =>
  queryOptions({ queryKey: ["league", "tournament", id], queryFn: () => fetchTournament(id) });

export const regulationQuery = () =>
  queryOptions({
    queryKey: ["league", "regulation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulation_versions")
        .select("id, body, published_at, effective_from")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Команды, которыми пользователь владеет или где он капитан. */
export const myTeamsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["league", "my-teams", userId ?? "guest"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      const { data: caps } = await supabase.from("team_captains").select("team_id").eq("user_id", userId);
      const capIds = (caps ?? []).map((c) => c.team_id);
      let q = supabase.from("teams").select("*, team_members(*), team_captains(user_id)").order("created_at");
      q = capIds.length ? q.or(`owner_id.eq.${userId},id.in.(${capIds.join(",")})`) : q.eq("owner_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

/** Заявки команд пользователя (по всем турнирам). */
export const myApplicationsQuery = (teamIds: string[]) =>
  queryOptions({
    queryKey: ["league", "my-applications", teamIds.join(",")],
    enabled: teamIds.length > 0,
    queryFn: async () => {
      if (!teamIds.length) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("id, tournament_id, team_id, status, reject_reason, created_at, regulation_version_id, tournaments(title, registration_closes_at, status)")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const allTeamsQuery = () =>
  queryOptions({
    queryKey: ["league", "teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*, team_members(id, nickname, role, mmr, position)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export type RankingRow = { teamId: string; name: string; logo?: string; points: number; titles: number; events: number };

/** Рейтинг по points_ledger (по id команды). Имя и логотип — из последнего снимка участия. */
export const rankingQuery = () =>
  queryOptions({
    queryKey: ["league", "ranking"],
    queryFn: async () => {
      const [ledger, placements, participants] = await Promise.all([
        supabase.from("points_ledger").select("team_id, points, tournament_id"),
        supabase.from("placements").select("team_id, tournament_id, place"),
        supabase.from("tournament_participants").select("team_id, team_name, logo_url, created_at").order("created_at"),
      ]);
      if (ledger.error) throw ledger.error;
      const snap = new Map<string, { name: string; logo?: string }>();
      for (const p of participants.data ?? []) snap.set(p.team_id, { name: p.team_name, logo: p.logo_url ?? undefined });
      const rows = new Map<string, RankingRow>();
      const get = (id: string) => {
        let r = rows.get(id);
        if (!r) {
          const s = snap.get(id);
          r = { teamId: id, name: s?.name ?? "—", logo: s?.logo, points: 0, titles: 0, events: 0 };
          rows.set(id, r);
        }
        return r;
      };
      for (const e of ledger.data ?? []) get(e.team_id).points += e.points;
      for (const p of placements.data ?? []) {
        const r = get(p.team_id);
        r.events += 1;
        if (p.place === 1) r.titles += 1;
      }
      return [...rows.values()].sort((a, b) => b.points - a.points || b.titles - a.titles);
    },
  });

export const pendingApplicationsQuery = () =>
  queryOptions({
    queryKey: ["league", "applications-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, tournaments(id, title, team_limit)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export type MyApplicationStatus = ApplicationStatus;
