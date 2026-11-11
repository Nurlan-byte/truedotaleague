import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Crown,
  ImagePlus,
  LogOut,
  MoreVertical,
  Pencil,
  Shield,
  Trash2,
  Trophy,
  UserMinus,
  Users,
} from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { APPLICATION_LABEL, formatLeagueDate } from "@/lib/league";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";
import { removeDiscordPosts } from "@/lib/discord-notify.functions";
import { LEAGUE_RULES, leagueStatus, type LeagueStatus } from "@/lib/my-team";

type Profile = {
  nickname: string;
  avatar_url: string | null;
  mmr: number | null;
  competitive_rating: number | null;
} | null;
export type Member = {
  id: string;
  profile_id: string | null;
  position: number;
  nickname: string;
  mmr: number | null;
  profiles: unknown;
};
export type DashTeam = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  owner_id: string;
  team_members: Member[];
};
type App = {
  id: string;
  tournament_id: string;
  status: keyof typeof APPLICATION_LABEL;
  reject_reason: string | null;
  regulation_version_id: string | null;
  created_at: string;
  tournaments: { title: string } | null;
};

type Props = {
  team: DashTeam;
  userId: string;
  isOwner: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  apps: App[];
  appsActions: (a: App) => ReactNode;
  invitePanel: ReactNode;
};

const prof = (m: Member) => m.profiles as Profile;
const nameOf = (m: Member) => prof(m)?.nickname || m.nickname || "Игрок";
const crOf = (m: Member) => prof(m)?.competitive_rating ?? null;
const mmrOf = (m: Member) => prof(m)?.mmr ?? m.mmr ?? null;
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));

const STATUS: Record<LeagueStatus, { text: string; cls: string }> = {
  ok: { text: "Подходит по рейтингу", cls: "bg-win/15 text-win" },
  team_limit: { text: "Превышен командный лимит", cls: "bg-destructive/15 text-destructive" },
  player_limit: {
    text: "Превышен индивидуальный лимит",
    cls: "bg-destructive/15 text-destructive",
  },
  not_enough: { text: "Недостаточно основных игроков", cls: "bg-muted text-muted-foreground" },
  needs_check: { text: "Требуется дополнительная проверка", cls: "bg-accent/15 text-accent" },
};

export function TeamDashboard({
  team,
  userId,
  isOwner,
  busy,
  run,
  rpc,
  apps,
  appsActions,
  invitePanel,
}: Props) {
  const members = [...team.team_members].sort((a, b) => a.position - b.position);
  const main = members.filter((m) => m.position < 5);
  const bench = members.filter((m) => m.position >= 5);
  const captain = members.find((m) => m.profile_id === team.owner_id);
  const mainCr = main.reduce((s, m) => s + (crOf(m) ?? 0), 0);
  const mainMmr = main.reduce((s, m) => s + (mmrOf(m) ?? 0), 0);
  const [rename, setRename] = useState(false);
  const [transfer, setTransfer] = useState(false);

  const freeSlot = (bench: boolean) => {
    const used = new Set(members.map((m) => m.position));
    const range = bench ? [5, 6] : [0, 1, 2, 3, 4];
    return range.find((p) => !used.has(p));
  };

  const uploadLogo = (f: File) => {
    const err = validateLogoFile(f);
    if (err) return toast.error(err);
    run(async () => {
      const logo = await fileToLogoDataUrl(f);
      await rpc("manage_team", { p_team_id: team.id, p_action: "logo", p_value: logo });
      toast.success("Логотип обновлён");
    });
  };

  return (
    <div className="mt-5 space-y-5">
      {/* Шапка команды */}
      <section className="panel overflow-hidden">
        <div className="bg-hero p-5 text-navy-foreground">
          <div className="flex min-w-0 items-center gap-4">
            <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl text-navy-foreground">
                {team.name} <span className="text-base font-semibold text-sky">[{team.tag}]</span>
              </h2>
              <p className="truncate text-xs opacity-80">
                <Crown className="mr-1 inline size-3.5" />
                Капитан: {captain ? nameOf(captain) : "—"} · {isOwner ? "вы капитан" : "вы игрок"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid size-10 shrink-0 place-items-center rounded-full bg-navy-foreground/15 hover:bg-navy-foreground/25"
                aria-label="Действия с командой"
              >
                <MoreVertical className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Команда</DropdownMenuLabel>
                {isOwner ? (
                  <>
                    <DropdownMenuItem onSelect={() => setRename(true)}>
                      <Pencil className="size-4" /> Название и тег
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <label className="cursor-pointer">
                        <ImagePlus className="size-4" /> Загрузить логотип
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) uploadLogo(f);
                          }}
                        />
                      </label>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setTransfer(true)}
                      disabled={members.length < 2}
                    >
                      <Crown className="size-4" /> Передать капитанство
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => {
                        if (!confirm(`Удалить команду «${team.name}»? Это необратимо.`)) return;
                        run(async () => {
                          await rpc("manage_team", { p_team_id: team.id, p_action: "delete" });
                          removeDiscordPosts({ data: { teamId: team.id } }).catch(() => {});
                          toast.success("Команда удалена");
                        });
                      }}
                    >
                      <Trash2 className="size-4" /> Удалить команду
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => {
                      if (!confirm("Покинуть команду?")) return;
                      run(async () => {
                        await rpc("manage_team", { p_team_id: team.id, p_action: "leave" });
                        toast.success("Вы покинули команду");
                      });
                    }}
                  >
                    <LogOut className="size-4" /> Покинуть команду
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <Stat label="Основа" value={`${main.length}/5`} />
          <Stat label="Запас" value={`${bench.length}/2`} />
          <Stat label="CR пятёрки" value={fmt(mainCr)} />
          <Stat label="MMR пятёрки" value={fmt(mainMmr)} />
        </div>
      </section>

      <Tabs defaultValue="roster">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="roster">Состав</TabsTrigger>
          <TabsTrigger value="tournaments">Турниры</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <RosterBlock
                title="Основной состав"
                hint="5 игроков"
                list={main}
                team={team}
                isOwner={isOwner}
                busy={busy}
                moveLabel="В запас"
                moveTarget={() => freeSlot(true)}
                run={run}
                rpc={rpc}
                other={bench}
              />
              <RosterBlock
                title="Запасные"
                hint="до 2 игроков"
                list={bench}
                team={team}
                isOwner={isOwner}
                busy={busy}
                moveLabel="В основу"
                moveTarget={() => freeSlot(false)}
                run={run}
                rpc={rpc}
                other={main}
              />
            </div>
            <div className="space-y-5">
              <LeaguesBlock main={main} />
              {isOwner && members.length < 7 && <div className="panel p-5">{invitePanel}</div>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tournaments" className="mt-4">
          <TournamentsTab teamId={team.id} apps={apps} appsActions={appsActions} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab teamId={team.id} />
        </TabsContent>
      </Tabs>

      <RenameDialog
        open={rename}
        onOpenChange={setRename}
        team={team}
        busy={busy}
        onSave={(n, t) =>
          run(async () => {
            await rpc("rename_team", { p_team_id: team.id, p_name: n, p_tag: t });
            toast.success("Сохранено");
            setRename(false);
          })
        }
      />
      <Dialog open={transfer} onOpenChange={setTransfer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Передать капитанство</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Новый капитан получит управление командой, а вы станете обычным игроком.
          </p>
          <ul className="space-y-1.5">
            {members
              .filter((m) => m.profile_id && m.profile_id !== userId)
              .map((m) => (
                <li key={m.id}>
                  <button
                    disabled={busy}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-3 text-left text-sm hover:border-primary"
                    onClick={() => {
                      if (!confirm(`Передать капитанство игроку ${nameOf(m)}?`)) return;
                      run(async () => {
                        await rpc("transfer_team_owner", {
                          p_team_id: team.id,
                          p_user_id: m.profile_id,
                        });
                        toast.success("Капитанство передано");
                        setTransfer(false);
                      });
                    }}
                  >
                    {nameOf(m)} <Crown className="size-4 text-primary" />
                  </button>
                </li>
              ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="label-xs">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-foreground">{value}</p>
    </div>
  );
}

function RosterBlock(p: {
  title: string;
  hint: string;
  list: Member[];
  other: Member[];
  team: DashTeam;
  isOwner: boolean;
  busy: boolean;
  moveLabel: string;
  moveTarget: () => number | undefined;
  run: Props["run"];
  rpc: Props["rpc"];
}) {
  return (
    <section className="panel p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Users className="size-4 text-primary" /> {p.title}{" "}
        <span className="font-normal text-muted-foreground">· {p.hint}</span>
      </h3>
      {p.list.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Пока пусто
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {p.list.map((m) => {
            const pr = prof(m);
            const isCap = m.profile_id === p.team.owner_id;
            const target = p.moveTarget();
            return (
              <li key={m.id} className="flex min-w-0 items-center gap-3 py-2.5">
                {pr?.avatar_url ? (
                  <img
                    src={pr.avatar_url}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground">
                    {nameOf(m).slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
                    {m.profile_id ? (
                      <Link
                        to="/players/$playerId"
                        params={{ playerId: m.profile_id }}
                        className="truncate hover:text-primary"
                      >
                        {nameOf(m)}
                      </Link>
                    ) : (
                      <span className="truncate">{nameOf(m)}</span>
                    )}
                    {isCap && (
                      <Crown className="size-3.5 shrink-0 text-primary" aria-label="Капитан" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmt(crOf(m))}</span> CR ·{" "}
                    {fmt(mmrOf(m))} MMR · {m.position < 5 ? "основа" : "запас"}
                  </p>
                </div>
                {p.isOwner && m.profile_id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                      aria-label="Действия с игроком"
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {target != null && (
                        <DropdownMenuItem
                          disabled={p.busy}
                          onSelect={() =>
                            p.run(async () => {
                              await p.rpc("set_member_slot", {
                                p_team_id: p.team.id,
                                p_user_id: m.profile_id,
                                p_position: target,
                              });
                            })
                          }
                        >
                          <ArrowDownUp className="size-4" /> {p.moveLabel}
                        </DropdownMenuItem>
                      )}
                      {p.other.filter((o) => o.profile_id).length > 0 && (
                        <DropdownMenuLabel className="text-xs">
                          Поменять местами с
                        </DropdownMenuLabel>
                      )}
                      {p.other
                        .filter((o) => o.profile_id)
                        .map((o) => (
                          <DropdownMenuItem
                            key={o.id}
                            disabled={p.busy}
                            onSelect={() =>
                              p.run(async () => {
                                await p.rpc("set_member_slot", {
                                  p_team_id: p.team.id,
                                  p_user_id: m.profile_id,
                                  p_position: o.position,
                                });
                              })
                            }
                          >
                            <ArrowDownUp className="size-4" /> {nameOf(o)}
                          </DropdownMenuItem>
                        ))}
                      {!isCap && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => {
                              if (!confirm(`Исключить ${nameOf(m)} из команды?`)) return;
                              p.run(async () => {
                                await p.rpc("manage_team", {
                                  p_team_id: p.team.id,
                                  p_action: "remove",
                                  p_user_id: m.profile_id,
                                });
                              });
                            }}
                          >
                            <UserMinus className="size-4" /> Исключить
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LeaguesBlock({ main }: { main: Member[] }) {
  const ratings = main.map(crOf);
  return (
    <section className="panel p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Shield className="size-4 text-primary" /> Доступные лиги
      </h3>
      <ul className="mt-3 space-y-2">
        {LEAGUE_RULES.map((r) => {
          const s = STATUS[leagueStatus(r, ratings)];
          return (
            <li key={r.id} className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.teamMax ? `До ${fmt(r.teamMax)} на команду` : "Без ограничения"}
                {r.playerMax ? ` · до ${fmt(r.playerMax)} на игрока` : ""}
              </p>
              <span
                className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
              >
                {s.text}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Считается по Competitive Rating основной пятёрки. Это не допуск: решение принимают судьи по
        регламенту турнира.
      </p>
    </section>
  );
}

type MatchRow = {
  id: string;
  tournament_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
  tournaments: { title: string } | null;
};

const teamMatchesQuery = (teamId: string) => ({
  queryKey: ["league", "team-matches", teamId],
  queryFn: async () => {
    const [m, p] = await Promise.all([
      supabase
        .from("matches")
        .select(
          "id, tournament_id, team_a_id, team_b_id, score_a, score_b, scheduled_at, tournaments(title)",
        )
        .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
        .order("scheduled_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("placements")
        .select("id, tournament_id, place, points, tournaments(title)")
        .eq("team_id", teamId),
    ]);
    if (m.error) throw m.error;
    if (p.error) throw p.error;
    const ids = new Set<string>();
    for (const x of m.data ?? [])
      for (const t of [x.team_a_id, x.team_b_id]) if (t && t !== teamId) ids.add(t);
    const names = new Map<string, string>();
    if (ids.size) {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", [...ids]);
      for (const t of data ?? []) names.set(t.id, t.name);
    }
    return { matches: (m.data ?? []) as MatchRow[], placements: p.data ?? [], names };
  },
});

function useTeamMatches(teamId: string) {
  return useQuery(teamMatchesQuery(teamId));
}

function TabSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function MatchLine({
  m,
  teamId,
  names,
}: {
  m: MatchRow;
  teamId: string;
  names: Map<string, string>;
}) {
  const home = m.team_a_id === teamId;
  const opp = home ? m.team_b_id : m.team_a_id;
  const us = home ? m.score_a : m.score_b;
  const them = home ? m.score_b : m.score_a;
  const played = us != null && them != null;
  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">
          vs {opp ? (names.get(opp) ?? "Команда") : "TBD"}
        </p>
        <Link
          to="/tournaments/$tournamentId"
          params={{ tournamentId: m.tournament_id }}
          className="truncate text-xs text-muted-foreground hover:text-primary"
        >
          {m.tournaments?.title ?? "Турнир"}
          {m.scheduled_at ? ` · ${formatLeagueDate(m.scheduled_at)}` : ""}
        </Link>
      </div>
      {played ? (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${us! > them! ? "bg-win/15 text-win" : us! < them! ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}
        >
          {us}:{them}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">скоро</span>
      )}
    </li>
  );
}

function TournamentsTab({
  teamId,
  apps,
  appsActions,
}: {
  teamId: string;
  apps: App[];
  appsActions: (a: App) => ReactNode;
}) {
  const q = useTeamMatches(teamId);
  const upcoming = (q.data?.matches ?? []).filter((m) => m.score_a == null || m.score_b == null);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-4 sm:p-5">
        <h3 className="text-sm font-bold text-foreground">Заявки на турниры</h3>
        {apps.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Заявок пока нет. Подать заявку можно на странице{" "}
            <Link to="/tournaments" className="font-semibold text-primary">
              турнира
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {apps.map((a) => (
              <li key={a.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                <Link
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: a.tournament_id }}
                  className="font-semibold text-foreground hover:text-primary"
                >
                  {a.tournaments?.title ?? "Турнир"}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {APPLICATION_LABEL[a.status]} · {formatLeagueDate(a.created_at)}
                </p>
                {a.reject_reason && (
                  <p className="mt-1 text-xs text-destructive">Причина: {a.reject_reason}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-3">{appsActions(a)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel p-4 sm:p-5">
        <h3 className="text-sm font-bold text-foreground">Предстоящие матчи</h3>
        {q.isPending ? (
          <div className="mt-3">
            <TabSkeleton />
          </div>
        ) : q.isError ? (
          <p className="mt-3 text-xs text-destructive">
            Не удалось загрузить матчи.{" "}
            <button className="font-semibold underline" onClick={() => q.refetch()}>
              Повторить
            </button>
          </p>
        ) : upcoming.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Запланированных матчей нет.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {upcoming.map((m) => (
              <MatchLine key={m.id} m={m} teamId={teamId} names={q.data!.names} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryTab({ teamId }: { teamId: string }) {
  const q = useTeamMatches(teamId);
  if (q.isPending) return <TabSkeleton />;
  if (q.isError)
    return (
      <p className="panel p-5 text-sm text-destructive">
        Не удалось загрузить историю.{" "}
        <button className="font-semibold underline" onClick={() => q.refetch()}>
          Повторить
        </button>
      </p>
    );
  const played = q.data.matches.filter(
    (m) => m.score_a != null && m.score_b != null && m.team_a_id && m.team_b_id,
  );
  let w = 0,
    l = 0;
  for (const m of played) {
    const home = m.team_a_id === teamId;
    const us = home ? m.score_a! : m.score_b!,
      them = home ? m.score_b! : m.score_a!;
    if (us > them) w++;
    else if (us < them) l++;
  }
  const pl = q.data.placements;
  const places = (n: number) => pl.filter((p) => p.place === n).length;
  if (played.length === 0 && pl.length === 0)
    return (
      <div className="panel p-8 text-center text-sm text-muted-foreground">
        <Trophy className="mx-auto mb-2 size-8 text-primary/50" />
        Статистики пока нет — она появится после первых сыгранных матчей.
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="panel grid grid-cols-3 gap-px overflow-hidden bg-border sm:grid-cols-6">
        <Stat label="Турниров" value={String(pl.length)} />
        <Stat label="Победы" value={String(w)} />
        <Stat label="Поражения" value={String(l)} />
        <Stat label="Win rate" value={w + l ? `${Math.round((w / (w + l)) * 100)}%` : "—"} />
        <Stat label="🥇 / 🥈 / 🥉" value={`${places(1)}/${places(2)}/${places(3)}`} />
        <Stat label="TDL Points" value={String(pl.reduce((s, p) => s + p.points, 0))} />
      </div>
      {played.length > 0 && (
        <section className="panel p-4 sm:p-5">
          <h3 className="text-sm font-bold text-foreground">История матчей</h3>
          <ul className="mt-2 divide-y divide-border">
            {[...played].reverse().map((m) => (
              <MatchLine key={m.id} m={m} teamId={teamId} names={q.data.names} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  team,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: DashTeam;
  busy: boolean;
  onSave: (n: string, t: string) => void;
}) {
  const [n, setN] = useState(team.name);
  const [t, setT] = useState(team.tag);
  const cls =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Название и тег</DialogTitle>
        </DialogHeader>
        <input
          value={n}
          onChange={(e) => setN(e.target.value)}
          maxLength={100}
          placeholder="Название"
          className={cls}
        />
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          maxLength={8}
          placeholder="Тег"
          className={cls}
        />
        <DialogFooter>
          <button
            disabled={busy || !n.trim() || !t.trim()}
            onClick={() => onSave(n.trim(), t.trim())}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Сохранить
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
