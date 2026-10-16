import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { myApplicationsQuery, myTeamsQuery } from "@/lib/league-api";
import type { ApplicationStatus } from "@/lib/league";

/** Статус заявки пользователя по каждому турниру (последняя не отозванная). */
export function useMyApplications() {
  const { user } = useAuth();
  const teams = useQuery(myTeamsQuery(user?.id));
  const ids = (teams.data ?? []).map((t) => t.id);
  const apps = useQuery(myApplicationsQuery(ids));
  const byTournament = new Map<string, ApplicationStatus>();
  for (const a of apps.data ?? []) {
    if (a.status === "withdrawn") continue;
    if (!byTournament.has(a.tournament_id)) byTournament.set(a.tournament_id, a.status);
  }
  return { user, byTournament, teams: teams.data ?? [], applications: apps.data ?? [] };
}
