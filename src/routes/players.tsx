import { fetchProfileTeams, teamsForProfile } from "@/lib/profile-api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Search, Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Участники лиги — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Список участников TrueDotaLeague: никнеймы, рейтинг MMR, команды и роли игроков лиги по Дота 2.",
      },
      { property: "og:title", content: "Участники лиги — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Все игроки лиги по Дота 2: MMR, позиция, команда или статус «ищу команду».",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayersPage,
});

type Row = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  mmr: number | null;
  role_position: string;
  team_name: string;
  looking_for_team: boolean;
};

type Filter = "all" | "with-team" | "free-agent";

export function TeamBadge({ row }: { row: Pick<Row, "team_name" | "looking_for_team"> }) {
  if (row.team_name.trim() !== "") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
        <Shield className="size-3" /> {row.team_name}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        row.looking_for_team ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
      }`}
    >
      {row.looking_for_team ? "Ищет команду" : "Без команды"}
    </span>
  );
}

function PlayersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from("profiles")
        .select("id, nickname, avatar_url, mmr, role_position, looking_for_team")
        .order("mmr", { ascending: false, nullsFirst: false }),
      fetchProfileTeams(),
    ])
      .then(([result, teams]) => {
        if (!active) return;
        if (result.error) throw result.error;
        setRows(
          (result.data ?? []).map((profile) => ({
            ...profile,
            team_name: teamsForProfile(teams, profile.id)
              .map((team) => team.name)
              .join(", "),
          })),
        );
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const list = (rows ?? [])
    .filter((r) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return (
        (r.nickname || "").toLowerCase().includes(needle) ||
        (r.team_name || "").toLowerCase().includes(needle)
      );
    })
    .filter((r) => {
      if (filter === "with-team") return r.team_name.trim() !== "";
      if (filter === "free-agent") return r.team_name.trim() === "";
      return true;
    });

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "with-team", label: "В команде" },
    { key: "free-agent", label: "Без команды" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 lg:px-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> На главную
      </Link>

      <h1 className="flex items-center gap-3 text-4xl leading-none text-foreground sm:text-5xl">
        <Users className="size-7 text-primary" /> Участники
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Игроки лиги. Нажмите на карточку, чтобы открыть киберспортивный профиль игрока.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по нику или команде…"
            aria-label="Поиск участника"
            className="w-full rounded-lg border border-input bg-white/70 py-2 pl-9 pr-3 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-white/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <p role="alert" className="panel mt-6 p-5 text-sm text-destructive">
          Не удалось загрузить участников и составы. Обновите страницу.
        </p>
      ) : rows === null ? (
        <p className="panel mt-6 p-5 text-sm text-muted-foreground">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="panel mt-6 p-5 text-sm text-muted-foreground">
          Никого не найдено по этому фильтру.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                to="/players/$playerId"
                params={{ playerId: p.id }}
                className="panel flex items-center gap-3 p-4 transition-transform hover:scale-[1.02]"
              >
                <TeamLogo name={p.nickname || "?"} logo={p.avatar_url ?? undefined} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {p.nickname || "Без ника"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.mmr !== null ? `${p.mmr} MMR` : "MMR не указан"}
                    {p.role_position ? ` · ${p.role_position}` : ""}
                  </p>
                  <div className="mt-1.5">
                    <TeamBadge row={p} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
