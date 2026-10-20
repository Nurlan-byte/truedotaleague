import { myApplicationsQuery } from "@/lib/league-api";
import { effectiveRegulationQuery } from "@/lib/league-admin";
import { APPLICATION_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { myTeamsQuery } from "@/lib/league-api";
import { teamRpc, teamSystemQuery } from "@/lib/team-invitations";
import { TeamInvitations, InvitePlayer } from "@/components/TeamInvitations";
import { TeamLogo } from "@/components/TeamLogo";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";
const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
export function MyTeamPage() {
  const { user, loading } = useAuth();
  const system = useQuery(teamSystemQuery(user?.id));
  const teams = useQuery(myTeamsQuery(user?.id));
  const apps = useQuery(myApplicationsQuery((teams.data ?? []).map((t) => t.id)));
  const effectiveReg = useQuery(effectiveRegulationQuery());
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [captain, setCaptain] = useState("");
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league"] }),
    onError: (e) => toast.error(e.message.replace(/^!/, "")),
  });
  if (loading) return <p>Загрузка…</p>;
  if (!user)
    return (
      <div className="p-8">
        <Link to="/auth">Войдите в аккаунт</Link>
      </div>
    );
  if (system.isPending) return <p className="p-8">Загрузка системы команд…</p>;
  if (system.isError)
    return (
      <div className="p-8">
        <p>Не удалось проверить систему команд.</p>
        <button onClick={() => void system.refetch()}>Повторить</button>
      </div>
    );
  if (!system.data)
    return (
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <h1 className="text-4xl">Моя команда</h1>
        <p className="panel p-5">
          Система команд обновляется. Существующие команды и составы сохранены. Создание команд и
          изменения состава станут доступны после безопасного переноса данных.
        </p>
        {teams.isPending ? (
          <p>Загрузка команд…</p>
        ) : teams.isError ? (
          <button onClick={() => void teams.refetch()}>
            Не удалось загрузить команды. Повторить
          </button>
        ) : (
          teams.data.map((t) => (
            <section key={t.id} className="panel space-y-3 p-5">
              <h2 className="text-xl">
                {t.name} [{t.tag}]
              </h2>
              <p>{t.owner_id === user.id ? "Вы владелец" : "Вы участник"}</p>
              <ul>
                {t.team_members.map((m) => (
                  <li key={m.id}>
                    {m.nickname} · {m.role || "Роль не указана"} · {m.mmr ?? "—"} MMR
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <Link to="/tournaments">Турниры и заявки</Link>
      </main>
    );
  const manage = (
    teamId: string,
    action: string,
    userId: string | null = null,
    value: string | null = null,
  ) =>
    run.mutate(() =>
      teamRpc("manage_team", {
        p_team_id: teamId,
        p_action: action,
        p_user_id: userId,
        p_value: value,
      }),
    );
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <h1 className="text-4xl">Моя команда</h1>
      <p>
        До 5 основных и 2 запасных игроков. Роль и MMR берутся из{" "}
        <Link to="/profile" className="text-primary">
          профиля игрока
        </Link>
        .
      </p>
      <TeamInvitations userId={user.id} />
      {teams.isPending ? (
        <p>Загрузка команды…</p>
      ) : teams.isError ? (
        <button onClick={() => void teams.refetch()}>
          Не удалось загрузить команду. Повторить
        </button>
      ) : !teams.data.length ? (
        <section className="panel space-y-3 p-5">
          <h2 className="text-lg font-semibold">Создать команду</h2>
          <input
            aria-label="Название команды"
            className="w-full min-w-0 rounded border p-2 sm:w-auto"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название"
          />
          <input
            aria-label="Тег команды"
            className="w-full min-w-0 rounded border p-2 sm:w-auto"
            maxLength={8}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Тег"
          />
          <button
            className={button}
            disabled={run.isPending || !name.trim()}
            onClick={() =>
              run.mutate(async () => {
                await teamRpc("create_team", { p_name: name.trim(), p_tag: tag.trim() });
                setName("");
                setTag("");
              })
            }
          >
            Создать
          </button>
        </section>
      ) : (
        teams.data.map((team) => {
          const teamApps = (apps.data ?? []).filter((a) => a.team_id === team.id);
          const owner = team.owner_id === user.id;
          const manager = owner || team.team_captains.some((c) => c.user_id === user.id);
          return (
            <section key={team.id} className="panel space-y-4 p-5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <TeamLogo name={team.name} logo={team.logo_url ?? undefined} />
                <h2 className="min-w-0 flex-1 break-words text-xl">
                  {team.name} [{team.tag}]
                </h2>
                <span>{owner ? "Вы владелец" : manager ? "Вы капитан" : "Вы игрок"}</span>
              </div>
              {manager && (
                <label className="block">
                  Логотип
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={run.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
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
              <h3>Состав ({team.team_members.length}/7)</h3>
              <ul className="space-y-2">
                {team.team_members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 rounded border p-3">
                    <span className="min-w-0 basis-full break-words sm:flex-1 sm:basis-auto">
                      {m.nickname} · {m.role || "Роль не указана"} · {m.mmr ?? "—"} MMR
                      {team.team_captains.some((c) => c.user_id === m.profile_id) && " · Капитан"}
                    </span>
                    <span>{m.roster_slot === "reserve" ? "Запасной" : "Основной"}</span>
                    {owner && (
                      <>
                        <button
                          className={button}
                          disabled={run.isPending}
                          onClick={() =>
                            manage(
                              team.id,
                              m.roster_slot === "reserve" ? "main" : "reserve",
                              m.profile_id,
                            )
                          }
                        >
                          {m.roster_slot === "reserve" ? "В основной" : "В запас"}
                        </button>
                        {m.profile_id !== user.id && (
                          <>
                            <button
                              className={button}
                              disabled={run.isPending}
                              onClick={() => {
                                if (confirm(`Исключить ${m.nickname}?`))
                                  manage(team.id, "remove", m.profile_id);
                              }}
                            >
                              Исключить
                            </button>
                            {team.team_captains.some((c) => c.user_id === m.profile_id) && (
                              <button
                                className={button}
                                disabled={run.isPending}
                                onClick={() => manage(team.id, "uncaptain", m.profile_id)}
                              >
                                Снять капитана
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {manager && (
                <>
                  <InvitePlayer
                    teamId={team.id}
                    disabled={run.isPending || team.team_members.length >= 7}
                  />
                  <TeamInvitations userId={user.id} teamId={team.id} />
                </>
              )}
              {owner && (
                <div>
                  <label>
                    Назначить капитана
                    <select
                      aria-label="Участник для назначения капитаном"
                      className="w-full min-w-0 rounded border p-2 sm:w-auto"
                      value={captain}
                      onChange={(e) => setCaptain(e.target.value)}
                    >
                      <option value="">Выберите участника</option>
                      {team.team_members
                        .filter(
                          (m) =>
                            m.profile_id !== user.id &&
                            !team.team_captains.some((c) => c.user_id === m.profile_id),
                        )
                        .map((m) => (
                          <option key={m.id} value={m.profile_id!}>
                            {m.nickname}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className={button}
                    disabled={
                      run.isPending || !team.team_members.some((m) => m.profile_id === captain)
                    }
                    onClick={() => {
                      manage(team.id, "captain", captain);
                      setCaptain("");
                    }}
                  >
                    Назначить
                  </button>
                </div>
              )}
              <button
                className={button}
                disabled={run.isPending}
                onClick={() => {
                  if (confirm(owner ? `Удалить команду ${team.name}?` : "Покинуть команду?"))
                    manage(team.id, owner ? "delete" : "leave");
                }}
              >
                {owner ? "Удалить команду" : "Покинуть команду"}
              </button>{" "}
              {teamApps.length > 0 && (
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
                        {a.status === "rejected" &&
                          a.tournaments?.status === "registration_open" && (
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
                                className="font-semibold text-primary hover:underline"
                                onClick={() =>
                                  run.mutate(async () => {
                                    const { error } = await supabase.rpc(
                                      "reacknowledge_regulation",
                                      {
                                        p_application_id: a.id,
                                        p_version_id: effectiveReg.data!.id,
                                      },
                                    );
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
              <p>
                <Link to="/tournaments">Перейти к турнирам и заявкам</Link>
              </p>
            </section>
          );
        })
      )}
    </main>
  );
}
