import type { RankingRow } from "@/lib/league-api";

export type RankingFilter = "all" | "titles" | "events";
export type RankingSort = "points-desc" | "points-asc" | "titles" | "events";
export type RankedTeam = RankingRow & { rank: number };

/** Official standings use points, then titles. Equal teams keep their source order. */
export function canonicalRanking(rows: RankingRow[]): RankedTeam[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.points - a.row.points || b.row.titles - a.row.titles || a.index - b.index)
    .map((item, index) => ({ ...item.row, rank: index + 1 }));
}

export function visibleRanking(
  standings: RankedTeam[],
  search: string,
  filter: RankingFilter,
  sort: RankingSort,
): RankedTeam[] {
  const query = search.trim().toLocaleLowerCase("ru-RU");
  return standings
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
      return difference || a.rank - b.rank;
    });
}
