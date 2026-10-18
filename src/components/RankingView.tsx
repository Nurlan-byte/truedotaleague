import { useMemo, useState } from "react";
import { Search, Trophy, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import type { RankingRow } from "@/lib/league-api";

type Filter = "all" | "titles" | "events";
type Sort = "points-desc" | "points-asc" | "titles" | "events";
const number = new Intl.NumberFormat("ru-RU");
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Все команды" },
  { value: "titles", label: "С титулами" },
  { value: "events", label: "С участиями" },
];

export function RankingView({ rows }: { rows: RankingRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("points-desc");

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    const originalOrder = new Map(rows.map((row, index) => [row.teamId, index]));
    return rows
      .filter(
        (row) =>
          (!query || row.name.toLocaleLowerCase("ru-RU").includes(query)) &&
          (filter !== "titles" || row.titles > 0) &&
          (filter !== "events" || row.events > 0),
      )
      .sort((a, b) => {
        const difference =
          sort === "points-asc"
            ? a.points - b.points
            : sort === "titles"
              ? b.titles - a.titles
              : sort === "events"
                ? b.events - a.events
                : b.points - a.points;
        return (
          difference || (originalOrder.get(a.teamId) ?? 0) - (originalOrder.get(b.teamId) ?? 0)
        );
      });
  }, [rows, search, filter, sort]);

  if (rows.length === 0)
    return (
      <div className="panel p-6">
        <p className="font-semibold text-foreground">Рейтинг пока пуст</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Первые команды появятся после завершения турнира и начисления TDL points.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          1 место — 50 TDL · 2 место — 25 TDL · 3 место — 12 TDL · 4 место — 6 TDL.
        </p>
      </div>
    );

  return (
    <section className="panel overflow-hidden" aria-labelledby="ranking-title">
      <div className="border-b border-border bg-white/35 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-xs">Лидеры лиги</p>
            <h2
              id="ranking-title"
              className="mt-1 flex items-center gap-2 text-2xl text-foreground"
            >
              <Trophy className="size-5 text-accent" aria-hidden="true" /> Команды
            </h2>
          </div>
          <p className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            Команд: {number.format(rows.length)}
          </p>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_auto_auto] lg:items-end">
          <div>
            <label htmlFor="ranking-search" className="label-xs mb-1.5 block">
              Поиск команды
            </label>
            <div className="group relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                aria-hidden="true"
              />
              <input
                id="ranking-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название команды"
                className="h-10 w-full rounded-lg border border-border bg-white/75 pl-10 pr-10 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/45 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Очистить поиск"
                  className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="label-xs mb-1.5">Фильтр</p>
            <div
              role="group"
              aria-label="Фильтр команд"
              className="flex flex-wrap gap-1 rounded-lg border border-border bg-white/55 p-1"
            >
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors duration-200 sm:text-sm ${filter === option.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="ranking-sort" className="label-xs mb-1.5 block">
              Сортировка
            </label>
            <select
              id="ranking-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-10 w-full rounded-lg border border-border bg-white/75 px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/45 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 lg:w-auto"
            >
              <option value="points-desc">TDL: по убыванию</option>
              <option value="points-asc">TDL: по возрастанию</option>
              <option value="titles">Титулы: по убыванию</option>
              <option value="events">Турниры: по убыванию</option>
            </select>
          </div>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        Показано команд: {visibleRows.length}
      </p>
      {visibleRows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Команды не найдены</p>
          <p className="mt-1 text-sm text-muted-foreground">Попробуйте другой запрос или фильтр.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
            className="mt-4 rounded-lg border border-primary/30 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">Рейтинг команд по TDL points, титулам и участию</caption>
            <thead className="bg-secondary/70 text-secondary-foreground">
              <tr className="text-xs uppercase tracking-wider">
                <th scope="col" className="w-14 px-4 py-3 text-left">
                  #
                </th>
                <th scope="col" className="px-3 py-3 text-left">
                  Команда
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Турниров
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  Титулов
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  TDL
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={row.teamId}
                  className="group border-t border-border/65 bg-white/30 transition-colors duration-200 hover:bg-primary/8 focus-within:bg-primary/8"
                >
                  <td
                    className={`px-4 py-3 font-bold ${index === 0 ? "text-accent" : index === 1 ? "text-primary" : index === 2 ? "text-win" : "text-muted-foreground"}`}
                  >
                    {index + 1}
                  </td>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-foreground">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="transition-transform duration-200 motion-safe:group-hover:scale-105">
                        <TeamLogo name={row.name} logo={row.logo} size="md" />
                      </span>
                      <span className="truncate">{row.name}</span>
                    </span>
                  </th>
                  <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                    {number.format(row.events)}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                    {number.format(row.titles)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                    {number.format(row.points)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-border bg-white/30 px-4 py-3 text-xs text-muted-foreground sm:px-6">
        TDL points начисляются по результатам турниров. При равенстве очков порядок определяется
        титулами.
      </div>
    </section>
  );
}
