import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { legacyMyTeamsQuery } from "@/lib/legacy-team-api";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { QueryFeedback } from "@/components/LeaguePageIntro";
import { orderTeamMembers } from "@/lib/team-members";

/** Read-only compatibility screen. Never fall back to direct roster mutations. */
export function LegacyMyTeam() {
  const { user } = useAuth();
  const teams = useQuery(legacyMyTeamsQuery(user?.id));
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 lg:px-8">
      <h1 className="text-3xl font-bold">Моя команда</h1>
      <p role="status" className="panel p-5 text-sm">
        Приглашения игроков пока недоступны: требуется обновление сервера. Существующие команды и
        составы сохранены и доступны только для просмотра. Ручное добавление игроков отключено.
      </p>
      {teams.isPending ? (
        <LoadingPanel />
      ) : teams.isError ? (
        <QueryFeedback text="Не удалось загрузить команды." retry={() => void teams.refetch()} />
      ) : null}
      {(teams.data ?? []).map((team) => (
        <section key={team.id} className="panel min-w-0 space-y-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="md" />
            <h2 className="min-w-0 break-words text-xl font-semibold">
              {team.name} [{team.tag}]
            </h2>
          </div>
          <ul className="space-y-2">
            {orderTeamMembers(team.team_members).map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 break-words">{member.nickname}</span>
                <span className="tabular-nums">{member.mmr ?? "—"} MMR</span>
              </li>
            ))}
          </ul>
          {!team.team_members.length && (
            <p className="text-sm text-muted-foreground">В составе пока нет участников.</p>
          )}
        </section>
      ))}
    </div>
  );
}
