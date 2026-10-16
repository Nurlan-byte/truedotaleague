import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Archive, Medal, Search } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel, TournamentImage } from "@/components/league";
import { catalogQuery } from "@/lib/league-api";
import { formatLeagueDate, sortCatalog, teamsThatPlayed } from "@/lib/league";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Архив турниров — TrueDotaLeague" },
      { name: "description", content: "Завершённые турниры лиги по Dota 2: чемпионы, итоговые места и TDL points." },
      { property: "og:title", content: "Архив турниров TrueDotaLeague" },
      { property: "og:description", content: "История турниров лиги: сетки, результаты и победители." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const { data, isLoading, error } = useQuery(catalogQuery());
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortCatalog(
      (data ?? []).filter((t) => t.status === "finished" && (!needle || t.title.toLowerCase().includes(needle))),
    );
  }, [data, q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Archive className="size-7 text-primary" /> Архив турниров
      </h1>
      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию"
          className="w-full rounded-lg border border-input bg-white/70 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
        />
      </label>

      <div className="mt-5">
        {isLoading ? (
          <LoadingPanel />
        ) : error ? (
          <LoadingPanel text="Не удалось загрузить архив. Обновите страницу." />
        ) : list.length === 0 ? (
          <LoadingPanel text={q ? "Ничего не найдено." : "Завершённых турниров пока нет."} />
        ) : (
          <ul className="space-y-3">
            {list.map((t) => {
              const top = [...t.placements].sort((a, b) => a.place - b.place).slice(0, 3);
              return (
                <li key={t.id}>
                  <Link
                    to="/tournaments/$tournamentId"
                    params={{ tournamentId: t.id }}
                    className="panel flex min-w-0 gap-4 p-4 transition-shadow hover:shadow-lg"
                  >
                    <TournamentImage src={t.image_url} title={t.title} className="size-16 shrink-0 rounded-lg text-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-bold text-foreground">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatLeagueDate(t.starts_at, false) ?? "Дата не указана"} · команд сыграло: {teamsThatPlayed(t.matches)}
                      </p>
                      {top.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {top.map((p) => {
                            const snap = t.tournament_participants.find((x) => x.team_id === p.team_id);
                            return (
                              <li key={p.place} className="flex items-center gap-2 text-sm">
                                <Medal className={`size-4 ${p.place === 1 ? "text-accent" : "text-muted-foreground"}`} />
                                <TeamLogo name={p.team_name} logo={snap?.logo_url ?? undefined} />
                                <span className="truncate text-foreground">{p.team_name}</span>
                                <span className="ml-auto text-xs font-bold text-foreground">+{p.points} TDL</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
