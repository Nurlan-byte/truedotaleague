import { describe, expect, it } from "vitest";
import {
  FREEDOM,
  freedomCalendar,
  freedomTable,
  isBo2,
  matchPoints,
  validFreedomTime,
} from "./freedom";
describe("Freedom League season rules", () => {
  it("win 2:0 awards 3 points", () => expect(matchPoints(2, 0)).toBe(3));
  it("draw 1:1 awards 1 point", () => expect(matchPoints(1, 1)).toBe(1));
  it("loss 0:2 awards 0 points", () => expect(matchPoints(0, 2)).toBe(0));
  it("only completed Bo2 results count", () => {
    expect(isBo2(2, 0)).toBe(true);
    expect(isBo2(1, 1)).toBe(true);
    expect(isBo2(0, 2)).toBe(true);
    expect(isBo2(1, 0)).toBe(false);
    expect(isBo2(2, 2)).toBe(false);
    expect(isBo2(null, null)).toBe(false);
  });
  it("16 teams play 120 unique matches in 15 rounds", () => {
    const ids = Array.from({ length: 16 }, (_, i) => String(i));
    const matches = freedomCalendar(ids);
    expect(matches).toHaveLength(120);
    expect(matches.every((m) => validFreedomTime(m.scheduled_at))).toBe(true);
    expect(new Set(matches.map((m) => m.round)).size).toBe(15);
    expect(new Set(matches.map((m) => [m.team_a_id, m.team_b_id].sort().join(":"))).size).toBe(120);
    for (const id of ids)
      expect(matches.filter((m) => m.team_a_id === id || m.team_b_id === id)).toHaveLength(15);
    for (let r = 1; r <= 15; r++) {
      const round = matches.filter((m) => m.round === r);
      expect(round).toHaveLength(8);
      expect(new Set(round.flatMap((m) => [m.team_a_id, m.team_b_id])).size).toBe(16);
    }
  });
  it("odd team counts have byes, never duplicate or phantom opponents", () => {
    const matches = freedomCalendar(["a", "b", "c"]);
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map((m) => m.round)).size).toBe(3);
    expect(
      matches.every(
        (m) => ["a", "b", "c"].includes(m.team_a_id) && ["a", "b", "c"].includes(m.team_b_id),
      ),
    ).toBe(true);
  });
  it("no more than 16 teams", () =>
    expect(() => freedomCalendar(Array.from({ length: 17 }, (_, i) => String(i)))).toThrow());
  it("two daily rounds start at 12:00 and 14:00 UTC+5", () => {
    const calendar = freedomCalendar(Array.from({ length: 16 }, (_, i) => String(i)));
    expect(calendar.find((m) => m.round === 1)?.scheduled_at).toBe("2026-12-05T07:00:00Z");
    expect(calendar.find((m) => m.round === 2)?.scheduled_at).toBe("2026-12-05T09:00:00Z");
    expect(calendar.find((m) => m.round === 15)?.scheduled_at).toBe("2026-12-27T07:00:00Z");
  });
  it("fee is 50000 with four 12500 installments", () => {
    expect(FREEDOM.fee).toBe(50000);
    expect(FREEDOM.installments).toBe(4);
    expect(FREEDOM.installment).toBe(12500);
  });
  it("prize tiers reflect announcement", () =>
    expect(FREEDOM.tiers).toEqual([
      { teams: 8, prize: 350000 },
      { teams: 12, prize: 525000 },
      { teams: 16, prize: 700000 },
    ]));
  it("full-season prizes are 400000, 200000, 100000", () =>
    expect(FREEDOM.prizes).toEqual([400000, 200000, 100000]));
  it("schedule uses weekends in December 4–27 and 12:00–16:00 UTC+5", () => {
    expect(validFreedomTime("2026-12-05T07:00:00Z")).toBe(true);
    expect(validFreedomTime("2026-12-27T10:59:00Z")).toBe(true);
    expect(validFreedomTime("2026-12-04T07:00:00Z")).toBe(false);
    expect(validFreedomTime("2026-12-05T11:00:00Z")).toBe(false);
    expect(validFreedomTime("2027-01-02T07:00:00Z")).toBe(false);
  });
  it("standings aggregate both teams and ignore unplayed or invalid results", () => {
    const teams = ["a", "b", "c"].map((id) => ({ team_id: id, team_name: id, logo_url: null }));
    const rows = freedomTable(teams, [
      { team_a_id: "a", team_b_id: "b", score_a: 2, score_b: 0 },
      { team_a_id: "a", team_b_id: "c", score_a: 1, score_b: 1 },
      { team_a_id: "b", team_b_id: "c", score_a: null, score_b: null },
    ]);
    expect(rows[0]).toMatchObject({
      team_id: "a",
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      mapsFor: 3,
      mapsAgainst: 1,
      points: 4,
    });
    expect(rows.find((r) => r.team_id === "b")).toMatchObject({ played: 1, lost: 1, points: 0 });
    expect(rows.find((r) => r.team_id === "c")).toMatchObject({ played: 1, drawn: 1, points: 1 });
  });
});
