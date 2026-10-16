import { describe, expect, it } from "vitest";
import { countdown, formatLeagueDate, formatPrize, freePlaces, sortCatalog, teamsThatPlayed } from "./league";

describe("league helpers", () => {
  it("shows dates in league time UTC+5 with label", () => {
    expect(formatLeagueDate("2026-09-03T13:00:00Z")).toContain("18:00");
    expect(formatLeagueDate("2026-09-03T13:00:00Z")).toContain("(UTC+5)");
  });

  it("countdown never goes negative", () => {
    expect(countdown("2020-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z"))).toBe("0 мин");
  });

  it("free places = team_limit - accepted, never below 0", () => {
    expect(freePlaces(16, 10)).toBe(6);
    expect(freePlaces(8, 9)).toBe(0);
  });

  it("prize TBA shows «Будет объявлен»", () => {
    expect(formatPrize({ prize_tba: true, prize_amount: 100, prize_currency: "KZT" })).toBe("Будет объявлен");
  });

  it("default order: live, then upcoming by nearest start, then finished newest first", () => {
    const base = { title: "x", created_at: "" };
    const list = [
      { ...base, id: "f-old", status: "finished" as const, starts_at: "2025-01-01T00:00:00Z" },
      { ...base, id: "reg-far", status: "registration_open" as const, starts_at: "2026-12-01T00:00:00Z" },
      { ...base, id: "f-new", status: "finished" as const, starts_at: "2026-01-01T00:00:00Z" },
      { ...base, id: "ann-near", status: "announced" as const, starts_at: "2026-10-20T00:00:00Z" },
      { ...base, id: "live", status: "live" as const, starts_at: "2026-10-01T00:00:00Z" },
    ];
    expect(sortCatalog(list).map((t) => t.id)).toEqual(["live", "ann-near", "reg-far", "f-new", "f-old"]);
  });

  it("counts only teams that actually played a scored match", () => {
    expect(
      teamsThatPlayed([
        { team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 0 },
        { team_a_id: "c", team_b_id: "d", score_a: null, score_b: null },
      ]),
    ).toBe(2);
  });
});
