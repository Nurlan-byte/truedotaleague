import { fetchProfileTeams, teamsForProfile } from "@/lib/profile-api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Shield, Swords, TrendingUp, UserSearch } from "lucide-react";
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
  looking_for_team: boolean;
  created_at: string;
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function PlayerPage() {
  const { playerId } = Route.useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [teammates, setTeammates] = useState<Row[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [teamCount, setTeamCount] = useState(0);

  useEffect(() => {
    let active = true;
    setRow(null);
    setNotFound(false);
    setLoadError(false);
    setTeammates([]);
    setTeamCount(0);
    Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, nickname, avatar_url, mmr, role_position, bio, profile_url, looking_for_team, created_at",
        ),
      fetchProfileTeams(),
    ])
      .then(([result, teams]) => {
        if (!active) return;
        if (result.error) throw result.error;
        const profiles = result.data ?? [];
        const profile = profiles.find((item) => item.id === playerId);
        if (!profile) {
          setNotFound(true);
          return;
        }
        const ownTeams = teamsForProfile(teams, playerId);
        setTeamCount(ownTeams.length);
        const project = (item: typeof profile) => ({
          ...item,
          team_name: teamsForProfile(teams, item.id)
            .map((team) => team.name)
            .join(", "),
        });
        setRow(project(profile));
        setTeammates(
          profiles
            .filter((item) => item.id !== playerId && teamsForProfile(ownTeams, item.id).length > 0)
            .map(project),
        );
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [playerId]);

  const inTeam = (row?.team_name ?? "").trim() !== "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 lg:px-8">
      <Link
        to="/players"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Все участники
      </Link>

      {loadError ? (
        <p role="alert" className="panel p-5 text-sm text-destructive">
          Не удалось загрузить профиль и состав. Обновите страницу.
        </p>
      ) : notFound ? (
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
                  inTeam ? row.team_name : row.looking_for_team ? "Ищет команду" : "Без команды"
                }
              />
            </div>

            {teamCount > 1 && (
              <p className="text-sm text-destructive">
                В данных несколько команд этого игрока. Показаны все; состав требует уточнения
                администратором.
              </p>
            )}
            {row.bio && <p className="whitespace-pre-line text-sm text-foreground">{row.bio}</p>}

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
              {inTeam ? (
                <Shield className="size-5 text-primary" />
              ) : (
                <UserSearch className="size-5 text-accent" />
              )}
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
                <p className="mt-2 text-sm text-muted-foreground">{row.team_name}</p>
                {teammates.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Пока это единственный участник лиги из этой команды.
                  </p>
                ) : (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {teammates.map((t) => (
                      <li key={t.id}>
                        <Link
                          to="/players/$playerId"
                          params={{ playerId: t.id }}
                          className="flex items-center gap-3 rounded-lg border border-border bg-white/60 p-3 transition-colors hover:border-primary"
                        >
                          <TeamLogo
                            name={t.nickname || "?"}
                            logo={t.avatar_url ?? undefined}
                            size="md"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">
                              {t.nickname || "Без ника"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.role_position || "игрок"}
                              {t.mmr !== null ? ` · ${t.mmr} MMR` : ""}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
