import { describe, expect, it } from "vitest";
import { divisionOf, mmrLimitText, winLoss } from "./divisions";

describe("divisions", () => {
  it("detects division by title", () => {
    expect(divisionOf("TDL Amateur #3")).toBe("amateur");
    expect(divisionOf("TDL Challenger Cup")).toBe("challenger");
    expect(divisionOf("Freedom Open")).toBe("freedom");
    expect(divisionOf("Кубок лиги")).toBeNull();
  });
  it("amateur team limit is 16 500, challenger 26 500, freedom unlimited", () => {
    expect(mmrLimitText("amateur")).toContain("16");
    expect(mmrLimitText("amateur")).toContain("500");
    expect(mmrLimitText("challenger")).toContain("26");
    expect(mmrLimitText("freedom")).toBe("Без ограничений MMR");
  });
  it("counts wins and losses only from finished non-draw matches", () => {
    const r = winLoss([
      { team_a_id: "a", team_b_id: "b", score_a: 2, score_b: 1 },
      { team_a_id: "a", team_b_id: "b", score_a: null, score_b: null },
      { team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 1 },
      { team_a_id: "b", team_b_id: "a", score_a: 2, score_b: 0 },
    ]);
    expect(r.get("a")).toEqual({ wins: 1, losses: 1 });
    expect(r.get("b")).toEqual({ wins: 1, losses: 1 });
  });
});
