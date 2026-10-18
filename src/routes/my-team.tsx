import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Plus, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { QueryFeedback } from "@/components/LeaguePageIntro";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { myApplicationsQuery, myTeamsQuery } from "@/lib/league-api";
import { APPLICATION_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";
import { effectiveRegulationQuery } from "@/lib/league-admin";
import { nextMemberPosition, orderTeamMembers } from "@/lib/team-members";

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
  "min-w-0 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white";

function MyTeamPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const teams = useQuery(myTeamsQuery(user?.id));
  const apps = useQuery(myApplicationsQuery((teams.data ?? []).map((t) => t.id)));
  const effectiveReg = useQuery(effectiveRegulationQuery());
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [player, setPlayer] = useState<
    Record<string, { nickname: string; role: string; mmr: string }>
  >({});
  const [captainNick, setCaptainNick] = useState<Record<string, string>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["league"] });
  const run = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: refresh,
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message.startsWith("!")
          ? e.message.slice(1)
          : rpcErrorText(e as Error),
      ),
  });
  const check = (error: { message: string; code?: string } | null, text?: string) => {
    if (!error) return;
    if (error.code === "23503")
      throw new Error("!Команду нельзя удалить: она участвовала в турнирах");
    throw new Error(text ? `!${text}` : error.message);
  };

  if (loading)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <LoadingPanel />
      </div>
    );
  if (!user)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <h1 className="flex items-center gap-2 text-4xl text-foreground">
          <Shield className="size-7 text-primary" /> Моя команда
        </h1>
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          Чтобы создать команду и подать заявку на турнир,{" "}
          <Link to="/auth" className="font-semibold text-primary hover:underline">
            войдите в аккаунт
          </Link>
          .
        </div>
      </div>
    );

  const create = () => {
    if (!name.trim()) return toast.error("Введите название команды");
    run.mutate(async () => {
      const { error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), tag: tag.trim(), owner_id: user.id });
      check(error);
      toast.success("Команда создана");
      setName("");
      setTag("");
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Shield className="size-7 text-primary" /> Моя команда
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Создайте команду и соберите состав. Заявку на турнир подаёт владелец или капитан на странице
        турнира в разделе{" "}
        <Link to="/tournaments" className="font-semibold text-primary hover:underline">
          «Турниры»
        </Link>
        .
      </p>

      <div className="panel mt-5 p-5">
        <h2 className="text-lg font-semibold text-foreground">Создать команду</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Название команды"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название команды"
            className={`${input} flex-1`}
          />
          <input
            aria-label="Тег команды"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Тег (напр. TDL)"
            maxLength={8}
            className={`${input} sm:w-40`}
          />
          <button
            onClick={create}
            disabled={run.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
          >
            <Plus className="size-4" /> Создать
          </button>
        </div>
      </div>

      {teams.isLoading ? (
        <div className="mt-5">
          <LoadingPanel />
        </div>
      ) : teams.isError ? (
        <div className="mt-5">
          <QueryFeedback
            text="Не удалось загрузить ваши команды."
            retry={() => void teams.refetch()}
          />
        </div>
      ) : (teams.data ?? []).length === 0 ? (
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          У вас пока нет команды. Создайте её выше.
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        {(teams.data ?? []).map((team) => {
          const isOwner = team.owner_id === user.id;
          const members = orderTeamMembers(team.team_members);
          const p = player[team.id] ?? { nickname: "", role: "", mmr: "" };
          const teamApps = (apps.data ?? []).filter((a) => a.team_id === team.id);
          return (
            <div key={team.id} className="panel p-5">
              <div className="flex min-w-0 items-center gap-3">
                <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-foreground">
                    {team.name}
                    {team.tag && (
                      <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-primary">
                        [{team.tag}]
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isOwner ? "Вы владелец" : "Вы капитан"} · игроков: {members.length}
                  </p>
                </div>
                <label
                  className="cursor-pointer text-muted-foreground hover:text-primary"
                  title="Загрузить логотип"
                >
                  <ImagePlus className="size-5" />
                  <span className="sr-only">Логотип команды {team.name}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      const err = validateLogoFile(f);
                      if (err) return toast.error(err);
                      run.mutate(async () => {
                        const logo = await fileToLogoDataUrl(f);
                        const { error } = await supabase
                          .from("teams")
                          .update({ logo_url: logo })
                          .eq("id", team.id);
                        check(error);
                        toast.success("Логотип обновлён");
                      });
                    }}
                  />
                </label>
                {isOwner && (
                  <button
                    onClick={() => {
                      if (!confirm(`Удалить команду «${team.name}»?`)) return;
                      run.mutate(async () => {
                        const { error } = await supabase.from("teams").delete().eq("id", team.id);
                        check(error);
                        toast.success("Команда удалена");
                      });
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Удалить команду ${team.name}`}
                  >
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>

              <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="size-4 text-primary" /> Состав
              </h3>
              <ul className="mt-2 space-y-1.5">
                {members.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Игроков нет — добавьте до 7 участников.
                  </li>
                )}
                {members.map((m, i) => (
                  <li
                    key={m.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg bg-white/50 px-3 py-2 text-sm text-foreground"
                  >
                    <span className="w-4 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.nickname}</span>
                    {m.role && (
                      <span className="shrink-0 text-xs text-muted-foreground">{m.role}</span>
                    )}
                    {m.mmr !== null && (
                      <span className="shrink-0 text-xs text-muted-foreground">{m.mmr} MMR</span>
                    )}
                    <button
                      onClick={() =>
                        run.mutate(async () => {
                          const { error } = await supabase
                            .from("team_members")
                            .delete()
                            .eq("id", m.id);
                          check(error);
                        })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Убрать ${m.nickname}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {members.length < 7 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label={`Ник игрока команды ${team.name}`}
                    value={p.nickname}
                    onChange={(e) =>
                      setPlayer({ ...player, [team.id]: { ...p, nickname: e.target.value } })
                    }
                    placeholder="Ник игрока"
                    className={`${input} flex-1`}
                  />
                  <input
                    aria-label={`Роль игрока команды ${team.name}`}
                    value={p.role}
                    onChange={(e) =>
                      setPlayer({ ...player, [team.id]: { ...p, role: e.target.value } })
                    }
                    placeholder="Роль (Carry, Mid…)"
                    className={`${input} sm:w-36`}
                  />
                  <input
                    aria-label={`MMR игрока команды ${team.name}`}
                    value={p.mmr}
                    onChange={(e) =>
                      setPlayer({ ...player, [team.id]: { ...p, mmr: e.target.value } })
                    }
                    placeholder="MMR"
                    inputMode="numeric"
                    className={`${input} sm:w-24`}
                  />
                  <button
                    onClick={() => {
                      if (!p.nickname.trim()) return toast.error("Введите ник игрока");
                      const mmr = p.mmr.trim() ? Number(p.mmr.replace(/\D/g, "")) : null;
                      run.mutate(async () => {
                        const { error } = await supabase.from("team_members").insert({
                          team_id: team.id,
                          nickname: p.nickname.trim(),
                          role: p.role.trim(),
                          mmr,
                          position: nextMemberPosition(members),
                        });
                        check(error);
                        setPlayer({ ...player, [team.id]: { nickname: "", role: "", mmr: "" } });
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
                  >
                    <Plus className="size-4" /> Добавить
                  </button>
                </div>
              )}

              {isOwner && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-foreground">Капитаны</h3>
                  <p className="text-xs text-muted-foreground">
                    Капитаны тоже могут подавать заявки от имени команды. Сейчас:{" "}
                    {team.team_captains.length || "нет"}.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label={`Ник капитана команды ${team.name}`}
                      value={captainNick[team.id] ?? ""}
                      onChange={(e) =>
                        setCaptainNick({ ...captainNick, [team.id]: e.target.value })
                      }
                      placeholder="Ник пользователя на сайте"
                      className={`${input} flex-1`}
                    />
                    <button
                      onClick={() => {
                        const nick = (captainNick[team.id] ?? "").trim();
                        if (!nick) return toast.error("Введите ник");
                        run.mutate(async () => {
                          const { data: prof } = await supabase
                            .from("profiles")
                            .select("id")
                            .eq("nickname", nick)
                            .limit(2);
                          if (!prof || prof.length !== 1)
                            throw new Error(
                              "!Пользователь с таким ником не найден или ник не уникален",
                            );
                          const { error } = await supabase
                            .from("team_captains")
                            .insert({ team_id: team.id, user_id: prof[0].id });
                          check(error, "Не удалось добавить капитана");
                          toast.success("Капитан добавлен");
                          setCaptainNick({ ...captainNick, [team.id]: "" });
                        });
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-white/70 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
                    >
                      <UserPlus className="size-4" /> Назначить
                    </button>
                  </div>
                </div>
              )}

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
            </div>
          );
        })}
      </div>
    </div>
  );
}
