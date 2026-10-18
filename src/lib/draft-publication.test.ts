import { describe, expect, it } from "vitest";
import { initialState, pick } from "@/lib/draft";
import { isPublishedDraft, publishedDraftFromState } from "@/lib/draft-publication";

describe("draft publication", () => {
  it("publishes only the result roster, not editor history or local archive", () => {
    const base = initialState();
    const state = pick(
      {
        ...base,
        phase: "live",
        captains: [
          { id: "a", name: "Alex", nick: "A", team: "Blue", color: "#000" },
          { id: "b", name: "Bora", team: "Red", color: "#f00" },
        ],
        players: [{ id: "p", name: "Player", nick: "P" }],
        archive: [{ title: "Old", text: "private", at: 1 }],
      },
      "p",
    );
    const result = publishedDraftFromState(state);
    expect(result.teams[0].players).toEqual([{ name: "Player", nick: "P" }]);
    expect(result.captainPlays).toBe(true);
    expect(result.teams[0].captainNick).toBe("A");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain('"history"');
    expect(isPublishedDraft(result)).toBe(true);
    expect(isPublishedDraft({ title: "Bad", teams: [{ name: "A", players: [] }] })).toBe(false);
    expect(publishedDraftFromState({ ...state, captainCounts: false }).captainPlays).toBe(false);
  });
});
