import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ImagePlus, Link2, RefreshCw, LogOut, Plus, Search, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { myApplicationsQuery } from "@/lib/league-api";
import { APPLICATION_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";
import { effectiveRegulationQuery } from "@/lib/league-admin";
import { notifyDiscord } from "@/lib/discord-notify.functions";
import { loadErrorText, pickMyTeamId, rosterMmr } from "@/lib/my-team";

export const Route = createFileRoute("/my-team")({
  head: () => ({
    meta: [
      { title: "Моя команда — создание состава | TrueDotaLeague" },
      {
        name: "description",
        content: "Создайте свою команду по Dota 2: название, тег, логотип и состав, затем подайте заявку на турнир лиги.",
      },
      { property: "og:title", content: "Моя команда — TrueDotaLeague" },
      { property: "og:description", content: "Создание команды и заявки на турниры лиги по Dota 2." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyTeamPage,
});

const input =
  "min-w-0 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white";

type Invite = {
  id: string;
  team_id: string;
  invited_user_id: string;
  status: string;
  team_name: string;
  team_tag: string;
  invited_user_name: string;
  invited_by_name: string;
};
type Found = { id: string; nickname: string; mmr: number | null; already_in_team: boolean };

const myTeamQuery = (userId: string | undefined) => ({
  queryKey: ["league", "my-team", userId ?? "guest"],
  enabled: !!userId,
  queryFn: async () => {
    if (!userId) return null;
    const [mem, own] = await Promise.all([
      supabase.from("team_members").select("team_id, created_at").eq("profile_id", userId),
      supabase.from("teams").select("id, created_at").eq("owner_id", userId),
    ]);
    if (mem.error) throw mem.error;
    if (own.error) throw own.error;
    const teamId = pickMyTeamId(mem.data ?? [], own.data ?? []);
    if (!teamId) return null;
    const { data, error } = await supabase
      .from("teams")
      .select("*, team_members(id, profile_id, position, nickname, mmr, profiles(nickname, avatar_url, mmr, competitive_rating))")
      .eq("id", teamId)
      .single();
    if (error) throw error;
    return data;
  },
});

const invitesQuery = (userId: string | undefined) => ({
  queryKey: ["league", "team-invites", userId ?? "guest"],
  enabled: !!userId,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("list_team_invites");
    if (error) throw error;
    return ((data as unknown as Invite[]) ?? []).filter((i) => i.status === "pending");
  },
});

function MyTeamPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const teamQ = useQuery(myTeamQuery(user?.id));
  const team = teamQ.data;
  const invites = useQuery(invitesQuery(user?.id));
  const apps = useQuery(myApplicationsQuery(team ? [team.id] : []));
  const effectiveReg = useQuery(effectiveRegulationQuery());
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["league"] });
  const run = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error && e.message.startsWith("!") ? e.message.slice(1) : rpcErrorText(e as Error)),
  });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) throw new Error(`!${rpcErrorText(error)}`);
    return data as unknown;
  };

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-8"><LoadingPanel /></div>;
  if (!user)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <h1 className="flex items-center gap-2 text-3xl text-foreground sm:text-4xl">
          <Shield className="size-7 text-primary" /> Моя команда
        </h1>
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          Чтобы создать команду или вступить в неё,{" "}
          <Link to="/auth" className="font-semibold text-primary hover:underline">войдите через Discord</Link>.
        </div>
      </div>
    );

  const isOwner = team?.owner_id === user.id;
  const incoming = (invites.data ?? []).filter((i) => i.invited_user_id === user.id);
  const outgoing = team ? (invites.data ?? []).filter((i) => i.team_id === team.id && i.invited_user_id !== user.id) : [];
  const members = team ? [...team.team_members].sort((a, b) => a.position - b.position) : [];
  const ratingOf = (m: (typeof members)[number]) => {
    const p = m.profiles as { mmr: number | null; competitive_rating: number | null } | null;
    return p?.competitive_rating ?? p?.mmr ?? m.mmr ?? null;
  };
  const mmr = rosterMmr(members.map((m) => ({ position: m.position, rating: ratingOf(m) })));
  const captain = members.find((m) => m.profile_id === team?.owner_id);
  const captainName = (captain?.profiles as { nickname: string } | null)?.nickname;
  const teamApps = apps.data ?? [];

  const create = () => {
    if (!name.trim()) return toast.error("Введите название команды");
    if (!tag.trim()) return toast.error("Введите тег команды");
    run.mutate(async () => {
      const id = (await rpc("create_team", { p_name: name.trim(), p_tag: tag.trim() })) as string;
      if (id) notifyDiscord({ data: { kind: "team_created", teamId: id } }).catch(() => {});
      // Keep the button locked until the new team is actually loaded.
      await teamQ.refetch();
      toast.success("Команда создана");
      setName("");
      setTag("");
    });
  };

  const doSearch = () => {
    if (!team || search.trim().length < 2) return toast.error("Введите минимум 2 символа ника");
    run.mutate(async () => {
      setFound((await rpc("search_team_players", { p_team_id: team.id, p_query: search.trim() })) as Found[]);
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-3xl text-foreground sm:text-4xl">
        <Shield className="size-7 text-primary" /> Моя команда
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Создайте команду, пригласите игроков с сайта, а затем подайте заявку на странице турнира в разделе{" "}
        <Link to="/tournaments" className="font-semibold text-primary hover:underline">«Турниры»</Link>.
      </p>

      {incoming.length > 0 && (
        <div className="panel mt-5 p-5">
          <h2 className="text-lg font-semibold text-foreground">Вас приглашают</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-foreground">
                  <b>{i.team_name}</b> [{i.team_tag}] · от {i.invited_by_name}
                </span>
                <button
                  disabled={run.isPending}
                  onClick={() => run.mutate(async () => { await rpc("accept_invite", { p_invite_id: i.id }); toast.success("Вы вступили в команду"); })}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Check className="size-3.5" /> Принять
                </button>
                <button
                  disabled={run.isPending}
                  onClick={() => run.mutate(async () => { await rpc("decline_invite", { p_invite_id: i.id }); toast.success("Приглашение отклонено"); })}
                  className="rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold text-foreground"
                >
                  Отклонить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teamQ.isPending ? (
        <div className="mt-5"><LoadingPanel /></div>
      ) : teamQ.isError ? (
        <div className="panel mt-5 p-5 text-sm">
          <p className="font-semibold text-destructive">{loadErrorText(teamQ.error)}</p>
          <button
            onClick={() => teamQ.refetch()}
            disabled={teamQ.isFetching}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {teamQ.isFetching ? "Загружаем…" : "Повторить"}
          </button>
        </div>
      ) : !team ? (
        <div className="panel mt-5 p-5">
          <h2 className="text-lg font-semibold text-foreground">Создать команду</h2>
          <p className="mt-1 text-xs text-muted-foreground">Вы станете владельцем и первым игроком состава. Один игрок — одна команда.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Название команды" className={`${input} flex-1`} />
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Тег (напр. TDL)" maxLength={8} className={`${input} sm:w-40`} />
            <button
              onClick={create}
              disabled={run.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
            >
              <Plus className="size-4" /> Создать
            </button>
          </div>
        </div>
      ) : (
        <div className="panel mt-5 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-foreground">
                {team.name}
                <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-primary">[{team.tag}]</span>
              </p>
              <p className="text-xs text-muted-foreground">{isOwner ? "Вы владелец" : "Вы игрок команды"} · капитан: {captainName ?? "—"} · игроков: {members.length}/7</p>
              <p className="text-xs text-muted-foreground">
                MMR основной пятёрки: <b className="text-foreground">{mmr.main}</b> · всего состава: <b className="text-foreground">{mmr.total}</b>
                {mmr.unrated > 0 && ` · без рейтинга: ${mmr.unrated}`}
              </p>
            </div>
            {isOwner ? (
              <>
                <label className="cursor-pointer text-muted-foreground hover:text-primary" title="Загрузить логотип">
                  <ImagePlus className="size-5" />
                  <span className="sr-only">Логотип команды</span>
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
                        await rpc("manage_team", { p_team_id: team.id, p_action: "logo", p_value: logo });
                        toast.success("Логотип обновлён");
                      });
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    if (!confirm(`Удалить команду «${team.name}»?`)) return;
                    run.mutate(async () => { await rpc("manage_team", { p_team_id: team.id, p_action: "delete" }); toast.success("Команда удалена"); });
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Удалить команду"
                >
                  <Trash2 className="size-5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (!confirm("Покинуть команду?")) return;
                  run.mutate(async () => { await rpc("manage_team", { p_team_id: team.id, p_action: "leave" }); toast.success("Вы покинули команду"); });
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-4" /> Покинуть
              </button>
            )}
          </div>

          <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="size-4 text-primary" /> Состав
          </h3>
          <ul className="mt-2 space-y-1.5">
            {members.map((m, i) => {
              const prof = m.profiles as { nickname: string; competitive_rating: number | null } | null;
              return (
                <li key={m.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-white/50 px-3 py-2 text-sm text-foreground">
                  <span className="w-4 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.profile_id ? (
                      <Link
                        to="/players/$playerId"
                        params={{ playerId: m.profile_id }}
                        className="underline-offset-2 hover:text-primary hover:underline"
                      >
                        {prof?.nickname || m.nickname || "Игрок"}
                      </Link>
                    ) : (
                      prof?.nickname || m.nickname || "Игрок"
                    )}
                    {m.profile_id === team.owner_id && <span className="ml-1 text-xs text-primary">★ капитан</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {prof?.competitive_rating != null
                      ? `${prof.competitive_rating} CR`
                      : ratingOf(m) != null
                        ? `${ratingOf(m)} MMR`
                        : "нет рейтинга"}
                  </span>
                  {isOwner && m.profile_id && m.profile_id !== team.owner_id && (
                    <button
                      onClick={() => {
                        if (!confirm("Убрать игрока из команды?")) return;
                        run.mutate(async () => { await rpc("manage_team", { p_team_id: team.id, p_action: "remove", p_user_id: m.profile_id }); });
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Убрать игрока"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {isOwner && members.length < 7 && <InviteLinkBlock teamId={team.id} />}

          {isOwner && members.length < 7 && (
            <div className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserPlus className="size-4 text-primary" /> Пригласить игрока
              </h3>
              <p className="text-xs text-muted-foreground">Игрок должен один раз войти на сайт через Discord. Найдите его по нику.</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Ник игрока"
                  className={`${input} flex-1`}
                />
                <button
                  onClick={doSearch}
                  disabled={run.isPending}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-white/70 px-3 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
                >
                  <Search className="size-4" /> Найти
                </button>
              </div>
              {found && (
                <ul className="mt-2 space-y-1.5">
                  {found.length === 0 && <li className="text-xs text-muted-foreground">Никого не нашли.</li>}
                  {found.map((f) => {
                    const invited = outgoing.some((o) => o.invited_user_id === f.id);
                    return (
                      <li key={f.id} className="flex items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-foreground">{f.nickname}</span>
                        {f.already_in_team ? (
                          <span className="text-xs text-muted-foreground">уже в команде</span>
                        ) : invited ? (
                          <span className="text-xs text-muted-foreground">приглашён</span>
                        ) : (
                          <button
                            disabled={run.isPending}
                            onClick={() => run.mutate(async () => { await rpc("invite_player", { p_team_id: team.id, p_user_id: f.id }); toast.success(`Приглашение отправлено: ${f.nickname}`); })}
                            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                          >
                            Пригласить
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {outgoing.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground">Ждут ответа:</p>
                  <ul className="mt-1 space-y-1">
                    {outgoing.map((o) => (
                      <li key={o.id} className="flex items-center gap-2 text-sm text-foreground">
                        <span className="min-w-0 flex-1 truncate">{o.invited_user_name}</span>
                        <button
                          onClick={() => run.mutate(async () => { await rpc("cancel_invite", { p_invite_id: o.id }); })}
                          className="text-xs font-semibold text-destructive hover:underline"
                        >
                          Отменить
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {teamApps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">Заявки на турниры</h3>
              <ul className="mt-2 space-y-1.5">
                {teamApps.map((a) => (
                  <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm">
                    <Link
                      to="/tournaments/$tournamentId"
                      params={{ tournamentId: a.tournament_id }}
                      className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary"
                    >
                      {a.tournaments?.title ?? "Турнир"}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {APPLICATION_LABEL[a.status]}
                      {a.reject_reason ? ` — ${a.reject_reason}` : ""} · {formatLeagueDate(a.created_at)}
                    </span>
                    {isOwner && (a.status === "pending" || a.status === "accepted") && effectiveReg.data && a.regulation_version_id !== effectiveReg.data.id && (
                      <button
                        className="w-full rounded-md bg-accent/15 px-2 py-1 text-left text-xs font-semibold text-primary"
                        onClick={() => run.mutate(async () => { await rpc("reacknowledge_regulation", { p_application_id: a.id, p_version_id: effectiveReg.data!.id }); toast.success("Ознакомление подтверждено"); })}
                      >
                        Новая версия регламента — подтвердить ознакомление
                      </button>
                    )}
                    {isOwner && (a.status === "pending" || a.status === "accepted") && (
                      <button
                        onClick={() => {
                          if (!confirm("Отозвать заявку?")) return;
                          run.mutate(async () => { await rpc("withdraw_application", { p_id: a.id }); toast.success("Заявка отозвана"); });
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
      )}
    </div>
  );
}

function InviteLinkBlock({ teamId }: { teamId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (regenerate: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("get_team_invite_link", { p_team_id: teamId, p_regenerate: regenerate });
    setBusy(false);
    if (error) return toast.error(rpcErrorText(error));
    const url = `${window.location.origin}/join/${data as string}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(regenerate ? "Новая ссылка скопирована, старая больше не работает" : "Ссылка скопирована");
    } catch {
      toast.success("Ссылка готова — скопируйте её");
    }
  };
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Link2 className="size-4 text-primary" /> Ссылка-приглашение
      </h3>
      <p className="text-xs text-muted-foreground">Отправьте ссылку игроку — после входа через Discord он сразу станет участником команды.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {link && <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${input} w-full flex-1`} />}
        <button type="button" disabled={busy} onClick={() => load(false)} className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          <Copy className="size-4" /> Скопировать ссылку
        </button>
        {link && (
          <button type="button" disabled={busy} onClick={() => load(true)} className="inline-flex items-center gap-1 rounded-full border border-input px-4 py-2 text-sm text-foreground disabled:opacity-60">
            <RefreshCw className="size-4" /> Новая ссылка
          </button>
        )}
      </div>
    </div>
  );
}
