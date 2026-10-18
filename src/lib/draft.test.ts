import { describe, expect, it } from "vitest";
import {
  captainIndexForTurn,
  currentTurn,
  initialState,
  ORG,
  pick,
  resultsText,
  undo,
  availablePlayers,
  type DraftState,
} from "./draft";

const order = (n: number, snake: boolean, turns: number) =>
  Array.from({ length: turns }, (_, t) => "ABCDEFG"[captainIndexForTurn(t, n, snake)]).join("");

describe("draft order", () => {
  it("snake with 4 captains: ABCD DCBA ABCD", () =>
    expect(order(4, true, 12)).toBe("ABCDDCBAABCD"));
  it("snake with 3 captains", () => expect(order(3, true, 9)).toBe("ABCCBAABC"));
  it("linear keeps order", () => expect(order(4, false, 8)).toBe("ABCDABCD"));
});

const make = (): DraftState => ({
  ...initialState(),
  phase: "live",
  teamSize: 2,
  captains: [
    { id: "a", name: "A", team: "TA", color: "#fff" },
    { id: "b", name: "B", team: "TB", color: "#fff" },
  ],
  players: [
    { id: "p1", name: "P1" },
    { id: "p2", name: "P2" },
    { id: "p3", name: "P3" },
  ],
});

describe("picks", () => {
  it("prevents picking the same player twice", () => {
    const s = pick(make(), "p1");
    expect(pick(s, "p1")).toBe(s);
  });
  it("undo returns player to pool and restores turn", () => {
    const s0 = make();
    const s1 = pick(s0, "p1");
    expect(currentTurn(s1)!.captain.id).toBe("b");
    const s2 = undo(s1);
    expect(availablePlayers(s2)).toHaveLength(3);
    expect(currentTurn(s2)!.captain.id).toBe("a");
  });
  it("completes when every team is full", () => {
    const s = pick(pick(make(), "p1"), "p2");
    expect(currentTurn(s)).toBeNull();
  });
});

describe("results export", () => {
  it("leads exported text with the organization name", () => {
    expect(ORG).toBe("TrueDotaLeague");
    const s = pick(pick(make(), "p1"), "p2");
    expect(resultsText(s).split("\n")[0]).toBe("TrueDotaLeague");
  });
});
