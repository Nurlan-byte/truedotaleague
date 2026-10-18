import { describe, expect, it } from "vitest";
import {
  bracketPayload,
  emptyForm,
  fromLeagueInput,
  rosterChanged,
  toLeagueInput,
  validateForm,
} from "./league-admin";

const base = () => ({
  ...emptyForm(),
  title: "Кубок",
  starts_at: "2026-11-01T18:00",
  registration_closes_at: "2026-10-31T18:00",
});

describe("tournament form rules", () => {
  it("UTC+5 input converts to UTC and back", () => {
    expect(fromLeagueInput("2026-09-03T18:00")).toBe("2026-09-03T13:00:00.000Z");
    expect(toLeagueInput("2026-09-03T13:00:00.000Z")).toBe("2026-09-03T18:00");
  });
  it("registration close must not be after start", () => {
    expect(
      validateForm({ ...base(), registration_closes_at: "2026-11-02T10:00" }, true)
        .registration_closes_at,
    ).toBeDefined();
  });
  it("offline requires venue and address", () => {
    expect(validateForm({ ...base(), mode: "offline" }, true).venue).toBeDefined();
    expect(
      validateForm(
        { ...base(), mode: "offline", venue_name: "Арена", venue_address: "ул. 1" },
        true,
      ).venue,
    ).toBeUndefined();
  });
  it("team limit is an integer of at least 2", () => {
    expect(validateForm({ ...base(), team_limit: "1" }, true).team_limit).toBeDefined();
    expect(validateForm({ ...base(), team_limit: "2" }, true).team_limit).toBeUndefined();
  });
  it("prize must be non-negative unless TBA", () => {
    expect(
      validateForm({ ...base(), prize_tba: false, prize_amount: "-5" }, true).prize,
    ).toBeDefined();
    expect(
      validateForm({ ...base(), prize_tba: false, prize_amount: "0" }, true).prize,
    ).toBeUndefined();
  });
  it("publish requires a title", () => {
    expect(validateForm({ ...base(), title: "" }, true).title).toBeDefined();
    expect(validateForm({ ...base(), title: "" }, false).title).toBeUndefined();
  });
});

describe("roster change detection", () => {
  it("flags added or renamed players", () => {
    const snap = { members: [{ nickname: "A" }, { nickname: "B" }] };
    expect(
      rosterChanged(snap, [
        { nickname: "A", position: 0 },
        { nickname: "B", position: 1 },
      ]),
    ).toBe(false);
    expect(
      rosterChanged(snap, [
        { nickname: "A", position: 0 },
        { nickname: "C", position: 1 },
      ]),
    ).toBe(true);
    expect(rosterChanged(snap, [{ nickname: "A", position: 0 }])).toBe(true);
  });
});

describe("bracket payload", () => {
  it("only first round carries teams; server propagates byes", () => {
    const teams = ["a", "b", "c"].map((id) => ({ id, name: id }));
    const p = bracketPayload(teams);
    expect(p.matches.filter((m) => m.round === 1)).toHaveLength(2);
    expect(
      p.matches
        .filter((m) => m.round > 1)
        .every((m) => m.team_a_id === null && m.team_b_id === null),
    ).toBe(true);
  });
});
