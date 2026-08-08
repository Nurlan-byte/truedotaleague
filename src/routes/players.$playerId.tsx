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
  team_role: string;
  looking_for_team: boolean;
  created_at: string;
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

function PlayerPage() {
  const { playerId } = Route.useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [teammates, setTeammates] = useState<Row[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("profiles")
      .select(
        "id, nickname, avatar_url, mmr, role_position, bio, profile_url, team_name, team_role, looking_for_team, created_at",
      )
      .eq("id", playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setRow(data as Row);
        else setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [playerId]);

  useEffect(() => {
    const team = row?.team_name?.trim();
    if (!team) {
      setTeammates([]);
      return;
    }
    let active = true;
    supabase
      .from("profiles")
      .select(
        "id, nickname, avatar_url, mmr, role_position, bio, profile_url, team_name, team_role, looking_for_team, created_at",
      )
      .eq("team_name", row!.team_name)
      .neq("id", playerId)
      .order("mmr", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (active) setTeammates((data as Row[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [row, playerId]);

  const inTeam = (row?.team_name ?? "").trim() !== "";

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
                value={inTeam ? row.team_name : row.looking_for_team ? "Ищет команду" : "Без команды"}
              />
            </div>

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
                  {row.team_name}
                  {row.team_role ? ` · роль игрока: ${row.team_role}` : ""}
                </p>
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
                              {t.team_role || t.role_position || "игрок"}
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
