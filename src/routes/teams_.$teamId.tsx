import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crown, History, Shield, TrendingUp, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";

export const Route = createFileRoute("/teams_/$teamId")({
  head: () => ({
    meta: [
      { title: "Команда — TrueDotaLeague" },
      { name: "description", content: "Карточка команды TrueDotaLeague: состав, рейтинги игроков и история турниров." },
      { property: "og:title", content: "Команда TrueDotaLeague" },
      { property: "og:description", content: "Состав команды, рейтинги игроков и результаты в турнирах лиги по Dota 2." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

type Member = {
  id: string;
  nickname: string;
  role: string | null;
  mmr: number | null;
  position: number;
  profile_id: string | null;
  profiles: { nickname: string; avatar_url: string | null; mmr: number | null; competitive_rating: number | null } | null;
};

type TeamRow = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  created_at: string;
  team_members: Member[];
};

type HistoryItem = {
  tournamentId: string;
  title: string;
  status: string;
  place: number | null;
  points: number | null;
  createdAt: string;
};

const PLACE_LABEL: Record<number, string> = { 1: "🥇 1 место", 2: "🥈 2 место", 3: "🥉 3 место" };

const teamQuery = (teamId: string) => ({
  queryKey: ["team-page", teamId],
  queryFn: async () => {
    const { data: team, error } = await supabase
      .from("teams")
      .select("id, name, tag, logo_url, created_at, team_members(id, nickname, role, mmr, position, profile_id)")
      .eq("id", teamId)
      .maybeSingle();
    if (error) throw error;
    if (!team) return { team: null as TeamRow | null, history: [] as HistoryItem[] };

    // Profiles are readable only via column-level grants, so fetch them
    // directly instead of embedding through team_members.
    const profileIds = (team.team_members ?? [])
      .map((m: { profile_id: string | null }) => m.profile_id)
      .filter((x: string | null): x is string => !!x);
    let profileMap = new Map<string, Member["profiles"]>();
    if (profileIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url, mmr, competitive_rating")
        .in("id", profileIds);
      profileMap = new Map(
        ((profs ?? []) as ({ id: string } & NonNullable<Member["profiles"]>)[]).map((p) => [p.id, p]),
      );
    }
    const members = ((team.team_members ?? []) as Omit<Member, "profiles">[]).map((m) => ({
      ...m,
      profiles: m.profile_id ? (profileMap.get(m.profile_id) ?? null) : null,
    }));

    const { data: parts } = await supabase
      .from("tournament_participants")
      .select("tournament_id, created_at, tournaments(title, status)")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    let places: { tournament_id: string; place: number; points: number }[] = [];
    if (parts && parts.length > 0) {
      const { data: pl } = await supabase
        .from("placements")
        .select("tournament_id, place, points")
        .eq("team_id", teamId);
      places = (pl as typeof places) ?? [];
    }

    const history: HistoryItem[] = (parts ?? []).map((p) => {
      const t = p.tournaments as { title: string; status: string } | null;
      const pl = places.find((x) => x.tournament_id === p.tournament_id) ?? null;
      return {
        tournamentId: p.tournament_id,
        title: t?.title ?? "Турнир",
        status: t?.status ?? "",
        place: pl?.place ?? null,
        points: pl?.points ?? null,
        createdAt: p.created_at,
      };
    });

    return { team: { ...(team as unknown as Omit<TeamRow, "team_members">), team_members: members }, history };
  },
});

function MemberCard({ m, captain }: { m: Member; captain: boolean }) {
  const rating = m.profiles?.competitive_rating ?? m.profiles?.mmr ?? m.mmr;
  const name = m.profiles?.nickname || m.nickname || "Игрок";
  const inner = (
    <>
      <TeamLogo name={name} logo={m.profiles?.avatar_url ?? undefined} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
          {name}
          {captain && <Crown className="size-3.5 shrink-0 text-accent" aria-label="Капитан" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {m.role ? `${m.role} · ` : ""}
          {rating !== null ? `${rating} MMR` : "рейтинг не указан"}
        </p>
      </div>
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-lg border border-border bg-white/60 p-3 transition-colors hover:border-primary";
  return m.profile_id ? (
    <Link to="/players/$playerId" params={{ playerId: m.profile_id }} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function TeamPage() {
  const { teamId } = Route.useParams();
  const { data, isLoading, error } = useQuery(teamQuery(teamId));
  const team = data?.team ?? null;

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <LoadingPanel />
      </main>
    );
  }

  if (error || !team) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
        <Link to="/teams" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Все команды
        </Link>
        <p className="panel p-5 text-sm text-muted-foreground">Команда не найдена.</p>
      </main>
    );
  }

  const members = [...team.team_members].sort((a, b) => a.position - b.position);
  const main = members.filter((m) => m.position <= 4);
  const subs = members.filter((m) => m.position > 4);
  const ratingOf = (m: Member) => m.profiles?.competitive_rating ?? m.profiles?.mmr ?? m.mmr ?? 0;
  const totalMmr = main.reduce((s, m) => s + ratingOf(m), 0);
  const history = data?.history ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <Link to="/teams" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Все команды
      </Link>

      <div className="space-y-4">
        <div className="panel p-6">
          <div className="flex items-center gap-4">
            <TeamLogo name={team.name} logo={team.logo_url ?? undefined} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-3xl leading-none text-foreground sm:text-4xl">{team.name}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {team.tag && <span className="mr-2 font-semibold uppercase text-primary">[{team.tag}]</span>}
                В лиге с {new Date(team.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-white/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Users className="size-3" /> Игроков
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {main.length} основа{subs.length > 0 ? ` + ${subs.length} запас` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="size-3" /> Сумма MMR
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">{totalMmr > 0 ? totalMmr : "—"}</p>
            </div>
            <div className="rounded-lg border border-border bg-white/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Trophy className="size-3" /> Турниров
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">{history.length}</p>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="flex items-center gap-2 text-2xl leading-none text-foreground">
            <Shield className="size-5 text-primary" /> Состав
          </h2>
          {members.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Состав пока не заполнен.</p>
          ) : (
            <>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {main.map((m, i) => (
                  <li key={m.id}>
                    <MemberCard m={m} captain={i === 0} />
                  </li>
                ))}
              </ul>
              {subs.length > 0 && (
                <>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Запасные</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {subs.map((m) => (
                      <li key={m.id}>
                        <MemberCard m={m} captain={false} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="flex items-center gap-2 text-2xl leading-none text-foreground">
            <History className="size-5 text-primary" /> История турниров
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Команда ещё не участвовала в турнирах лиги.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {history.map((h) => (
                <li
                  key={h.tournamentId}
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
                      {new Date(h.createdAt).toLocaleDateString("ru-RU")}
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
                      : h.status === "completed"
                        ? "без места"
                        : "в процессе"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
