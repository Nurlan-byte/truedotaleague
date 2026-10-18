import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingView } from "@/components/RankingView";
import type { RankingRow } from "@/lib/league-api";
import { rowMovement, rowTopInTable } from "./ranking-motion";
import { canonicalRanking, visibleRanking } from "./ranking-view";

const rows: RankingRow[] = [
  { teamId: "alpha", name: "Alpha", points: 50, titles: 0, events: 2 },
  { teamId: "gamma", name: "Zenith", points: 25, titles: 0, events: 1 },
  { teamId: "delta", name: "Delta", points: 25, titles: 0, events: 1 },
  { teamId: "beta", name: "Beta", points: 50, titles: 1, events: 2 },
];

describe("ranking presentation", () => {
  const standings = canonicalRanking(rows);

  it("keeps the official points/title order and stable equal-score ties", () => {
    expect(standings.map(({ teamId, rank }) => [teamId, rank])).toEqual([
      ["beta", 1],
      ["alpha", 2],
      ["gamma", 3],
      ["delta", 4],
    ]);
  });

  it("keeps third place when searching for Zenith", () => {
    expect(visibleRanking(standings, " zenITH ", "all", "points-desc")).toMatchObject([
      { teamId: "gamma", rank: 3 },
    ]);
  });

  it("does not change canonical places when points are sorted ascending", () => {
    expect(
      visibleRanking(standings, "", "all", "points-asc").map(({ teamId, rank }) => [teamId, rank]),
    ).toEqual([
      ["gamma", 3],
      ["delta", 4],
      ["beta", 1],
      ["alpha", 2],
    ]);
  });

  it("keeps places when filtering titles and provides a keyboard-scrollable table", () => {
    expect(visibleRanking(standings, "", "titles", "events")).toMatchObject([
      { teamId: "beta", rank: 1 },
    ]);
    const html = renderToStaticMarkup(<RankingView rows={rows} />);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Таблица рейтинга; прокрутите горизонтально');
    expect(html).toContain('class="px-4 py-3 font-bold text-accent">1</td>');
  });

  it("does not animate a no-op query after the page scrolls", () => {
    const sameRows = visibleRanking(standings, " ", "all", "points-desc");
    expect(sameRows.map((row) => row.teamId)).toEqual(standings.map((row) => row.teamId));
    const before = rowTopInTable(620, 500);
    const afterScrolling = rowTopInTable(420, 300);
    expect(rowMovement(before, afterScrolling)).toBe(0);
  });

  it("animates only the real row move after scroll then ascending sort", () => {
    const ascending = visibleRanking(standings, "", "all", "points-asc");
    expect(ascending[0].teamId).toBe("gamma");
    const zenithBefore = rowTopInTable(620, 500);
    const zenithAfterScrollAndSort = rowTopInTable(340, 300);
    expect(rowMovement(zenithBefore, zenithAfterScrollAndSort)).toBe(80);
  });
});
