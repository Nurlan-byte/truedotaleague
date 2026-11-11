import { describe, expect, it } from "vitest";
import { buildDoubleBracket, doubleSizeOk, finalPlacements, type Match } from "./tournament";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("Double Elimination", () => {
  it("accepts only 4, 8, 16, 32, 64 teams", () => {
    expect([3, 4, 6, 8, 16, 32].map(doubleSizeOk)).toEqual([false, true, false, true, true, true]);
  });

  it("8 teams: 7 upper, 6 lower, 1 grand final", () => {
    const m = buildDoubleBracket(ids(8));
    expect(m.filter((x) => x.bracket === "upper")).toHaveLength(7);
    expect(m.filter((x) => x.bracket === "lower")).toHaveLength(6);
    expect(m.filter((x) => x.bracket === "grand")).toHaveLength(1);
  });

  it("every upper match sends its loser to the lower bracket; lower final feeds grand final", () => {
    const m = buildDoubleBracket(ids(8));
    expect(m.filter((x) => x.bracket === "upper").every((x) => x.loser_key?.startsWith("l"))).toBe(true);
    expect(m.find((x) => x.key === "l4-0")?.next_key).toBe("g1-0");
    expect(m.find((x) => x.key === "u3-0")?.next_key).toBe("g1-0");
  });

  it("grand final winner is 1st (50 pts), loser 2nd (25 pts)", () => {
    const matches: Match[] = [
      { id: "g", bracket: "grand", round: 1, order: 0, teamA: "A", teamB: "B", scoreA: 1, scoreB: 2 },
      { id: "l", bracket: "lower", round: 2, order: 0, teamA: "B", teamB: "C", scoreA: 2, scoreB: 0 },
    ];
    const p = finalPlacements(matches, [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }]);
    expect(p.map((x) => [x.teamName, x.points])).toEqual([["B", 50], ["A", 25], ["C", 12]]);
  });
});
