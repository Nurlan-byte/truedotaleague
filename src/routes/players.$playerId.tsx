import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, History, Shield, Swords, TrendingUp, Trophy, UserSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/players/$playerId")({
  head: () => ({
    meta: [
      { title: "Профиль участника — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Публичный профиль участника TrueDotaLeague: никнейм, рейтинг MMR, роль на линии, команда и описание игрока.",
      },
      { property: "og:title", content: "Профиль участника — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Никнейм, MMR, позиция, команда и описание игрока лиги по Дота 2.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerPage,
});

type Row = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  mmr: number | null;
  role_position: string;
  bio: string;
  profile_url: string;
  team_name: string;
  team_role: string;
  looking_for_team: boolean;
  created_at: string;
  titles: string[] | null;
};

type Membership = { team_id: string; name: string; tag: string };

type Teammate = {
  id: string;
  nickname: string;
  mmr: number | null;
  position: number;
  profile_id: string | null;
  profiles: { nickname: string; avatar_url: string | null; mmr: number | null; competitive_rating: number | null } | null;
};

type HistoryItem = {
  tournamentId: string;
  title: string;
  teamName: string;
  teamTag: string;
  place: number | null;
  points: number | null;
  createdAt: string;
};

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

const PLACE_LABEL: Record<number, string> = { 1: "🥇 1 место", 2: "🥈 2 место", 3: "🥉 3 место" };

function PlayerPage() {
  const { playerId } = Route.useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setRow(null);
    setMembership(null);
    setTeammates([]);
    setHistory([]);
    setNotFound(false);

    supabase
      .from("profiles")
      .select(
        "id, nickname, avatar_url, mmr, role_position, bio, profile_url, team_name, team_role, looking_for_team, created_at, titles",
      )
      .eq("id", playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setRow(data as Row);
        else setNotFound(true);
      });

    // Real team membership (not the free-text field in the profile).
    supabase
      .from("team_members")
      .select("team_id, created_at, teams(name, tag)")
      .eq("profile_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const t = data.teams as { name: string; tag: string } | null;
        if (t) setMembership({ team_id: data.team_id, name: t.name, tag: t.tag });
      });

    // Team history: tournaments whose roster snapshot contains this player.
    supabase
      .from("tournament_participants")
      .select("tournament_id, team_id, team_name, team_tag, created_at, tournaments(title)")
      .contains("roster_snapshot", { members: [{ profile_id: playerId }] })
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        if (!active || !data || data.length === 0) return;
        const { data: places } = await supabase
          .from("placements")
          .select("tournament_id, team_id, place, points");
        if (!active) return;
        const placeOf = (tid: string, teamId: string) =>
          (places ?? []).find((p) => p.tournament_id === tid && p.team_id === teamId) ?? null;
        setHistory(
          data.map((p) => {
            const pl = placeOf(p.tournament_id, p.team_id);
            return {
              tournamentId: p.tournament_id,
              title: (p.tournaments as { title: string } | null)?.title ?? "Турнир",
              teamName: p.team_name,
              teamTag: p.team_tag,
              place: pl?.place ?? null,
              points: pl?.points ?? null,
              createdAt: p.created_at,
            };
          }),
        );
      });

    return () => {
      active = false;
    };
  }, [playerId]);

  useEffect(() => {
    if (!membership) {
      setTeammates([]);
      return;
    }
    let active = true;
    supabase
      .from("team_members")
      .select("id, nickname, mmr, position, profile_id, profiles(nickname, avatar_url, mmr, competitive_rating)")
      .eq("team_id", membership.team_id)
      .neq("profile_id", playerId)
      .order("position")
      .then(({ data }) => {
        if (active) setTeammates((data as Teammate[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [membership, playerId]);

  const teamName = membership?.name ?? (row?.team_name ?? "").trim();
  const inTeam = teamName !== "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 lg:px-8">
      <Link
        to="/players"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Все участники
      </Link>

      {notFound ? (
        <p className="panel p-5 text-sm text-muted-foreground">Игрок не найден.</p>
      ) : !row ? (
        <p className="panel p-5 text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="space-y-4">
          <div className="panel space-y-5 p-6">
            <div className="flex items-center gap-4">
              <TeamLogo name={row.nickname || "?"} logo={row.avatar_url ?? undefined} size="lg" />
              <div className="min-w-0">
                <h1 className="truncate text-3xl leading-none text-foreground sm:text-4xl">
                  {row.nickname || "Без ника"}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  В лиге с {new Date(row.created_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                icon={<TrendingUp className="size-3" />}
                label="Рейтинг"
                value={row.mmr !== null ? `${row.mmr} MMR` : "не указан"}
              />
              <Stat
                icon={<Swords className="size-3" />}
                label="Позиция"
                value={row.role_position || "не выбрана"}
              />
              <Stat
                icon={<Shield className="size-3" />}
                label="Команда"
                value={
                  inTeam
                    ? membership
                      ? `${teamName} [${membership.tag}]`
                      : teamName
                    : row.looking_for_team
                      ? "Ищет команду"
                      : "Без команды"
                }
              />
            </div>

            {row.bio && <p className="whitespace-pre-line text-sm text-foreground">{row.bio}</p>}

            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Trophy className="size-3" /> Титулы на сервере Discord
                {row.titles && row.titles.length > 0 && ` · ${row.titles.length}`}
              </p>
              {row.titles && row.titles.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {row.titles.map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Пока нет титулов — они появляются из ролей на сервере Discord лиги.
                </p>
              )}
            </div>

            {row.profile_url && (
              <a
                href={row.profile_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                <ExternalLink className="size-4" /> Профиль Steam / Dotabuff
              </a>
            )}
          </div>

          <div className="panel p-6">
            <h2 className="flex items-center gap-2 text-2xl leading-none text-foreground">
              {inTeam ? <Shield className="size-5 text-primary" /> : <UserSearch className="size-5 text-accent" />}
              {inTeam ? "Состав команды" : "Статус состава"}
            </h2>

            {!inTeam ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {row.looking_for_team
                  ? "Игрок свободный агент и открыт к предложениям от команд лиги."
                  : "Игрок не состоит в команде и не искал состав."}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {teamName}
                  {membership ? ` [${membership.tag}]` : ""}
                  {row.team_role ? ` · роль игрока: ${row.team_role}` : ""}
                </p>
                {membership && teammates.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Пока это единственный участник лиги из этой команды.
                  </p>
                ) : membership ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {teammates.map((t) => {
                      const rating = t.profiles?.competitive_rating ?? t.profiles?.mmr ?? t.mmr;
                      const name = t.profiles?.nickname || t.nickname || "Игрок";
                      const inner = (
                        <>
                          <TeamLogo name={name} logo={t.profiles?.avatar_url ?? undefined} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {rating !== null ? `${rating} MMR` : "рейтинг не указан"}
                            </p>
                          </div>
                        </>
                      );
                      return (
                        <li key={t.id}>
                          {t.profile_id ? (
                            <Link
                              to="/players/$playerId"
                              params={{ playerId: t.profile_id }}
                              className="flex items-center gap-3 rounded-lg border border-border bg-white/60 p-3 transition-colors hover:border-primary"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 rounded-lg border border-border bg-white/60 p-3">
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="panel p-6">
            <h2 className="flex items-center gap-2 text-2xl leading-none text-foreground">
              <History className="size-5 text-primary" /> История команд
            </h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Игрок ещё не участвовал в турнирах лиги — история появится после первого турнира.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {history.map((h) => (
                  <li
                    key={`${h.tournamentId}-${h.teamName}`}
                    className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/tournaments/$tournamentId"
                        params={{ tournamentId: h.tournamentId }}
                        className="block truncate font-bold text-foreground hover:text-primary hover:underline"
                      >
                        {h.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {h.teamName} [{h.teamTag}] · {new Date(h.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                        h.place === 1
                          ? "bg-accent/15 text-accent"
                          : h.place !== null
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {h.place !== null
                        ? `${PLACE_LABEL[h.place] ?? `${h.place} место`}${h.points ? ` · +${h.points} TDL` : ""}`
                        : "без места"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
