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
