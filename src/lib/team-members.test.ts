import { describe, expect, it } from "vitest";
import { nextMemberPosition, orderTeamMembers } from "./team-members";

describe("team member positions", () => {
  it("orders stored zero-based positions while display numbering remains sequential", () => {
    const members = orderTeamMembers([
      { id: "b", position: 2 },
      { id: "a", position: 0 },
      { id: "c", position: 2 },
    ]);
    expect(members.map((member) => member.id)).toEqual(["a", "b", "c"]);
    expect(members.map((_, index) => index + 1)).toEqual([1, 2, 3]);
  });

  it("appends after the highest position even when members were removed", () => {
    expect(nextMemberPosition([{ position: 0 }, { position: 3 }])).toBe(4);
    expect(nextMemberPosition([])).toBe(0);
  });
});
