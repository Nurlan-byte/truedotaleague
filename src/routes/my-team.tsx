import { LegacyMyTeam } from "@/components/LegacyMyTeam";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamInvitations, InvitePlayer } from "@/components/TeamInvitations";
import { LoadingPanel } from "@/components/league";
import { QueryFeedback } from "@/components/LeaguePageIntro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { myApplicationsQuery, myTeamsQuery } from "@/lib/league-api";
import { APPLICATION_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";
import { effectiveRegulationQuery } from "@/lib/league-admin";
import { orderTeamMembers } from "@/lib/team-members";
import { teamRpc, teamSystemQuery } from "@/lib/team-invitations";

export const Route = createFileRoute("/my-team")({
  head: () => ({
    meta: [
      { title: "Моя команда — создание состава | TrueDotaLeague" },
      {
        name: "description",
        content:
          "Создайте свою команду по Dota 2: название, тег, логотип и состав, затем подайте заявку на турнир лиги.",
      },
      { property: "og:title", content: "Моя команда — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Создание команды и заявки на турниры лиги по Dota 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyTeamPage,
});

const input =
  "min-w-0 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground";
const button =
  "rounded-lg border border-border bg-white/70 px-3 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50";

export function MyTeamPage() {
  const { user, loading } = useAuth();
  const system = useQuery(teamSystemQuery(user?.id));
  if (!loading && user && !system.isPending && !system.isError && system.data === false)
    return <LegacyMyTeam />;
  return <ModernMyTeamPage />;
}

export function ModernMyTeamPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const system = useQuery(teamSystemQuery(user?.id));
  const available = system.data === true && !system.isPending && !system.isError;
  const teams = useQuery(myTeamsQuery(user?.id));
  const apps = useQuery(
    myApplicationsQuery(
      (teams.data ?? []).filter((team) => team.owner_id === user?.id).map((team) => team.id),
    ),
  );
  const effectiveReg = useQuery(effectiveRegulationQuery());
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => {
      if (!available) throw new Error("Изменения команд пока недоступны.");
      return fn();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league"] }),
    onError: (error) => toast.error(error.message.replace(/^!/, "")),
  });
  if (loading)
    return (
      <div className="p-6">
        <LoadingPanel />
      </div>
    );
  if (!user)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold">Моя команда</h1>
        <p className="panel mt-5 p-5">
          Чтобы создать команду или принять приглашение,{" "}
          <Link to="/auth" className="font-semibold text-primary">
            войдите в аккаунт
          </Link>
          .
        </p>
      </div>
    );
  const manage = (
    teamId: string,
    action: "delete" | "leave" | "remove",
    profileId: string | null = null,
  ) =>
    run.mutate(() =>
      teamRpc("manage_team", { p_team_id: teamId, p_action: action, p_user_id: profileId }),
    );
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <Shield className="size-7 text-primary" />
        Моя команда
      </h1>
      <p className="text-sm text-muted-foreground">
        Создатель команды — её единственный капитан. Можно начать одному и пригласить игроков позже.
        В составе до 5 основных и 2 запасных игроков.
      </p>
      {system.isPending ? (
        <LoadingPanel />
      ) : system.isError ? (
        <QueryFeedback
          text="Не удалось проверить доступность изменений команд."
          retry={() => void system.refetch()}
        />
      ) : !available ? (
        <p role="status" className="panel p-5 text-sm">
          Изменения команд пока недоступны: требуется завершить обновление базы. Существующие
          команды сохранены.
        </p>
      ) : (
        <TeamInvitations
          userId={user.id}
          canAccept={!teams.isPending && !teams.isError && (teams.data?.length ?? 0) === 0}
        />
      )}
      {teams.isPending ? (
        <LoadingPanel />
      ) : teams.isError ? (
        <QueryFeedback
          text="Не удалось загрузить вашу команду."
          retry={() => void teams.refetch()}
        />
      ) : !teams.data.length ? (
        available && (
          <form
            className="panel space-y-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              run.mutate(async () => {
                await teamRpc("create_team", { p_name: name.trim(), p_tag: tag.trim() });
                setName("");
                setTag("");
                toast.success("Команда создана. Вы её капитан и первый участник.");
              });
            }}
          >
            <h2 className="text-lg font-semibold">Создать команду</h2>
            <p className="text-sm text-muted-foreground">
              Название и уникальный тег — всё, что нужно для старта.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
              <label className="grid gap-1 text-sm">
                Название
                <input
                  required
                  maxLength={100}
                  className={input}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Тег
                <input
                  required
                  maxLength={8}
                  className={input}
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                />
              </label>
              <button
                disabled={run.isPending || !name.trim() || !tag.trim()}
                className="min-h-10 w-full self-end rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors enabled:hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-secondary-foreground sm:w-auto"
              >
                Создать
              </button>
            </div>
          </form>
        )
      ) : (
        <p className="rounded-lg bg-primary/10 p-3 text-sm">
          {teams.data.some((team) => team.owner_id === user.id)
            ? "Вы уже создали команду. Вторую команду создать нельзя."
            : "Вы уже состоите в команде. Чтобы создать свою, сначала покиньте текущую."}
        </p>
      )}
      {(teams.data ?? []).map((team) => {
        const owner = team.owner_id === user.id;
        const members = orderTeamMembers(team.team_members);
        const teamApps = (apps.data ?? []).filter((application) => application.team_id === team.id);
        return (
          <section key={team.id} className="panel min-w-0 space-y-4 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="md" />
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-xl font-semibold">{team.name}</h2>
                <p className="break-words text-sm text-primary">[{team.tag}]</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {owner ? "Вы капитан" : "Вы участник"}
              </span>
            </div>
            {owner && available && (
              <label className="block text-sm">
                Логотип команды
                <input
                  className="mt-1 block w-full min-w-0 text-xs"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={run.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const error = validateLogoFile(file);
                    if (error) return toast.error(error);
                    run.mutate(async () =>
                      teamRpc("manage_team", {
                        p_team_id: team.id,
                        p_action: "logo",
                        p_value: await fileToLogoDataUrl(file),
                      }),
                    );
                  }}
                />
              </label>
            )}
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" />
              Состав · {members.length}/7
            </h3>
            <ul className="space-y-2">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 basis-full break-words sm:basis-auto">
                    {member.nickname}
                    {member.profile_id === team.owner_id && (
                      <span className="ml-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Капитан
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {member.position < 5 ? "Основной" : "Запасной"}
                  </span>
                  <span className="text-xs tabular-nums">{member.mmr ?? "—"} MMR</span>
                  {owner && available && member.profile_id && member.profile_id !== user.id && (
                    <button
                      disabled={run.isPending}
                      className={`${button} text-destructive`}
                      onClick={() => {
                        if (confirm(`Исключить ${member.nickname} из команды?`))
                          manage(team.id, "remove", member.profile_id);
                      }}
                    >
                      Исключить
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!members.length && (
              <p className="text-sm text-muted-foreground">В составе пока нет участников.</p>
            )}
            {owner && available && (
              <>
                <InvitePlayer teamId={team.id} disabled={run.isPending || members.length >= 7} />
                <TeamInvitations userId={user.id} teamId={team.id} />
              </>
            )}
            {available && (
              <button
                className={`${button} text-destructive`}
                disabled={run.isPending}
                onClick={() => {
                  if (confirm(owner ? `Удалить команду «${team.name}»?` : "Покинуть команду?"))
                    manage(team.id, owner ? "delete" : "leave");
                }}
              >
                {owner ? "Удалить команду" : "Покинуть команду"}
              </button>
            )}
            {owner && teamApps.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-foreground">Заявки на турниры</h3>
                <ul className="mt-2 space-y-1.5">
                  {teamApps.map((a) => (
                    <li
                      key={a.id}
                      className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm"
                    >
                      <Link
                        to="/tournaments/$tournamentId"
                        params={{ tournamentId: a.tournament_id }}
                        className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary"
                      >
                        {a.tournaments?.title ?? "Турнир"}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {APPLICATION_LABEL[a.status]}
                        {a.reject_reason ? ` — ${a.reject_reason}` : ""} ·{" "}
                        {formatLeagueDate(a.created_at)}
                      </span>
                      {a.status === "rejected" && a.tournaments?.status === "registration_open" && (
                        <Link
                          to="/tournaments/$tournamentId"
                          params={{ tournamentId: a.tournament_id }}
                          search={{ apply: true }}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Подать повторно
                        </Link>
                      )}
                      {(a.status === "pending" || a.status === "accepted") &&
                        effectiveReg.data &&
                        a.regulation_version_id !== effectiveReg.data.id && (
                          <span className="w-full rounded-md bg-accent/15 px-2 py-1 text-xs text-foreground">
                            Вступила в силу новая версия регламента.{" "}
                            <Link
                              to="/regulations"
                              className="font-semibold text-primary hover:underline"
                            >
                              Ознакомьтесь
                            </Link>{" "}
                            и{" "}
                            <button
                              disabled={run.isPending || !available}
                              className="font-semibold text-primary hover:underline disabled:opacity-50"
                              onClick={() =>
                                run.mutate(async () => {
                                  const { error } = await supabase.rpc("reacknowledge_regulation", {
                                    p_application_id: a.id,
                                    p_version_id: effectiveReg.data!.id,
                                  });
                                  if (error) throw new Error(`!${rpcErrorText(error)}`);
                                  toast.success("Ознакомление подтверждено");
                                })
                              }
                            >
                              подтвердите ознакомление
                            </button>
                          </span>
                        )}
                      {(a.status === "pending" || a.status === "accepted") && (
                        <button
                          disabled={run.isPending || !available}
                          onClick={() => {
                            if (!confirm("Отозвать заявку?")) return;
                            run.mutate(async () => {
                              const { error } = await supabase.rpc("withdraw_application", {
                                p_id: a.id,
                              });
                              if (error) throw new Error(`!${rpcErrorText(error)}`);
                              toast.success("Заявка отозвана");
                            });
                          }}
                          className="text-xs font-semibold text-destructive hover:underline"
                        >
                          Отозвать
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm">
              <Link to="/tournaments" className="font-semibold text-primary">
                Турниры и заявки
              </Link>
              {owner
                ? " — для заявки нужны 5 основных игроков с зарегистрированными профилями."
                : " — заявку подаёт капитан команды."}
            </p>
          </section>
        );
      })}
    </div>
  );
}
