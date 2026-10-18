import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Medal, Search, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { TournamentImage } from "@/components/league";
import { LeaguePageIntro, QueryFeedback } from "@/components/LeaguePageIntro";
import { catalogQuery } from "@/lib/league-api";
import { formatLeagueDate, leagueYear, teamsThatPlayed } from "@/lib/league";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Архив турниров — TrueDotaLeague" },
      { name: "description", content: "Завершённые турниры лиги, призёры и результаты." },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const catalog = useQuery(catalogQuery());
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const finished = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((item) => item.status === "finished")
        .sort(
          (a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime(),
        ),
    [catalog.data],
  );
  const years = [
    ...new Set(
      finished
        .map((item) => leagueYear(item.starts_at))
        .filter((value): value is number => value !== null),
    ),
  ];
  const list = finished.filter(
    (item) =>
      item.title.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")) &&
      (year === "all" || String(leagueYear(item.starts_at)) === year),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 lg:px-8">
      <LeaguePageIntro
        eyebrow="История лиги"
        title="Архив турниров"
        description="Завершённые соревнования, результаты матчей и призёры. Откройте турнир, чтобы посмотреть его итоги."
        actions={
          <Link
            to="/tournaments"
            className="rounded-lg border border-border bg-white/70 px-4 py-2 text-sm font-semibold text-foreground hover:border-primary"
          >
            Все турниры
          </Link>
        }
      >
        {catalog.data && (
          <p className="mt-5 border-t border-border pt-4 text-sm font-semibold text-foreground">
            Завершено: {finished.length}
          </p>
        )}
      </LeaguePageIntro>
      <div className="panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative min-w-0">
          <span className="sr-only">Поиск по архиву</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Найти турнир"
            className="w-full rounded-lg border border-input bg-white/80 py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Год турнира"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="rounded-lg border border-input bg-white/80 px-3 py-2 text-sm"
        >
          <option value="all">Все годы</option>
          {years.map((value) => (
            <option key={value} value={String(value)}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {catalog.isPending ? (
        <QueryFeedback text="Загружаем архив…" />
      ) : catalog.isError ? (
        <QueryFeedback text="Не удалось загрузить архив." retry={() => void catalog.refetch()} />
      ) : list.length === 0 ? (
        <QueryFeedback
          text={
            search || year !== "all"
              ? "По выбранным условиям турниров нет."
              : "Завершённых турниров пока нет. Результаты появятся здесь после финала."
          }
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((item) => {
            const podium = [...item.placements].sort((a, b) => a.place - b.place).slice(0, 3);
            return (
              <li key={item.id}>
                <Link
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: item.id }}
                  hash="results"
                  className="panel group block h-full overflow-hidden transition-shadow hover:shadow-lg"
                >
                  <div className="flex min-w-0 gap-4 p-4 sm:p-5">
                    <TournamentImage
                      src={item.image_url}
                      title={item.title}
                      className="size-16 shrink-0 rounded-lg text-lg sm:size-20"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">
                        Завершён
                      </p>
                      <h2 className="mt-1 break-words text-xl text-foreground group-hover:text-primary">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLeagueDate(item.starts_at, false) ?? "Дата не указана"}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border bg-white/35 px-4 py-3 sm:px-5">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="size-4" />
                      Играли команды: {teamsThatPlayed(item.matches)}
                    </p>
                    {podium.length ? (
                      <ol className="mt-3 space-y-2">
                        {podium.map((place) => {
                          const snapshot = item.tournament_participants.find(
                            (team) => team.team_id === place.team_id,
                          );
                          return (
                            <li
                              key={place.place}
                              className="flex min-w-0 items-center gap-2 text-sm text-foreground"
                            >
                              <Medal
                                className={`size-4 shrink-0 ${place.place === 1 ? "text-accent" : "text-muted-foreground"}`}
                              />
                              <span className="w-5 text-xs font-bold text-muted-foreground">
                                {place.place}
                              </span>
                              <TeamLogo
                                name={place.team_name}
                                logo={snapshot?.logo_url ?? undefined}
                              />
                              <span className="min-w-0 flex-1 truncate">{place.team_name}</span>
                              <span className="text-xs font-bold">+{place.points} TDL</span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Призёры пока не указаны.</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
