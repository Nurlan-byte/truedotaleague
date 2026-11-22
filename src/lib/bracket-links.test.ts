import { describe, expect, it } from "vitest";
import { toViewModel, type MatchRow } from "./league";
import { layoutBracket } from "./bracket-layout";

function row(id: string, bracket: string, round: number, overrides: Partial<MatchRow> = {}): MatchRow {
  return { id, bracket, round, slot: 0, tournament_id: "cup", stage: "playoff", group_id: null,
    team_a_id: null, team_b_id: null, score_a: null, score_b: null, winner_id: null,
    next_match_id: null, next_match_slot: null, loser_next_match_id: null, loser_next_match_slot: null,
    scheduled_at: null, legacy_id: null, version: 1, created_at: "", updated_at: "", ...overrides };
}

describe("official bracket advancement links", () => {
  it("preserves winner and loser destinations from the database, including their exact slots", () => {
    const vm = toViewModel([], [
      row("semi", "upper", 1, { next_match_id: "upper-final", next_match_slot: "b", loser_next_match_id: "lower", loser_next_match_slot: "a" }),
      row("upper-final", "upper", 2, { next_match_id: "grand", next_match_slot: "a", loser_next_match_id: "lower-final", loser_next_match_slot: "b" }),
      row("lower", "lower", 1, { next_match_id: "lower-final", next_match_slot: "a" }),
      row("lower-final", "lower", 2, { next_match_id: "grand", next_match_slot: "b" }),
      row("grand", "grand", 1),
    ], []);
    const edges = layoutBracket(vm.bracket).edges.map((e) => [e.from.match.id, e.to.match.id, e.side, e.loser]);
    expect(edges).toEqual([
      ["semi", "upper-final", "B", false], ["semi", "lower", "A", true],
      ["upper-final", "grand", "A", false], ["upper-final", "lower-final", "B", true],
      ["lower", "lower-final", "A", false], ["lower-final", "grand", "B", false],
    ]);
  });
});