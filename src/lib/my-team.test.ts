import { describe, expect, it } from "vitest";
import { loadErrorText, pickMyTeamId, rosterMmr } from "./my-team";

describe("pickMyTeamId", () => {
  it("prefers the team the user is a roster member of", () => {
    expect(
      pickMyTeamId(
        [{ team_id: "member-team", created_at: "2026-11-01" }],
        [{ id: "owned-newer", created_at: "2026-11-09" }],
      ),
    ).toBe("member-team");
  });
  it("falls back to the newest owned team for legacy owners", () => {
    expect(
      pickMyTeamId([], [
        { id: "old", created_at: "2026-10-21T16:59" },
        { id: "new", created_at: "2026-10-21T17:20" },
      ]),
    ).toBe("new");
  });
  it("returns null when the user has no team, so the create form is shown", () => {
    expect(pickMyTeamId([], [])).toBeNull();
  });
});

describe("rosterMmr", () => {
  it("sums main five (positions 0-4) separately from the whole roster", () => {
    const r = rosterMmr([
      { position: 0, rating: 6500 },
      { position: 1, rating: 7200 },
      { position: 5, rating: 3000 },
      { position: 2, rating: null },
    ]);
    expect(r).toEqual({ main: 13700, total: 16700, unrated: 1 });
  });
});

describe("loadErrorText", () => {
  it("keeps the database error code visible", () => {
    expect(loadErrorText({ code: "42501", message: "permission denied for table profiles" })).toBe(
      "Не удалось загрузить команду (код 42501): permission denied for table profiles",
    );
  });
});

import { LEAGUE_RULES, leagueStatus } from "./my-team";
describe("leagueStatus", () => {
  const [amateur, challenger, freedom] = LEAGUE_RULES;
  it("amateur allows 16500 total with players at most 4500", () => {
    expect(leagueStatus(amateur, [4500, 4500, 4500, 2000, 1000])).toBe("ok");
  });
  it("amateur rejects a team over 16500", () => {
    expect(leagueStatus(amateur, [4000, 4000, 4000, 4000, 1000])).toBe("team_limit");
  });
  it("amateur rejects a player over 4500", () => {
    expect(leagueStatus(amateur, [4600, 1000, 1000, 1000, 1000])).toBe("player_limit");
  });
  it("challenger limit is 26500", () => {
    expect(leagueStatus(challenger, [6000, 6000, 6000, 6000, 3000])).toBe("team_limit");
    expect(leagueStatus(challenger, [6000, 6000, 6000, 6000, 2500])).toBe("ok");
  });
  it("freedom has no limit but needs five players", () => {
    expect(leagueStatus(freedom, [12000, 12000, 12000, 12000, 12000])).toBe("ok");
    expect(leagueStatus(freedom, [1000, 1000])).toBe("not_enough");
  });
  it("missing rating needs manual check", () => {
    expect(leagueStatus(freedom, [1000, 1000, 1000, 1000, null])).toBe("needs_check");
  });
});
