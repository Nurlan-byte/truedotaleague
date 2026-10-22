import { describe, expect, it } from "vitest";
import { applicationRoster } from "./application-roster";

const five = Array.from({ length: 5 }, (_, position) => ({ profile_id: `p${position}`, position }));
describe("application roster eligibility", () => {
  it("requires five registered main players", () => {
    expect(applicationRoster(five.slice(0, 4))).toEqual({ count: 4, ready: false });
    expect(applicationRoster(five)).toEqual({ count: 5, ready: true });
  });
  it("counts a duplicated owner only once", () => {
    expect(applicationRoster([...five.slice(0, 4), { profile_id: 'p0', position: 4 }]).ready).toBe(false);
  });
  it("does not count text rows, reserves, or ownership outside the roster", () => {
    expect(applicationRoster([...five.slice(0, 4), { profile_id: null, position: 4 }, { profile_id: 'reserve', position: 5 }])).toEqual({ count: 4, ready: false });
    expect(applicationRoster([]).ready).toBe(false);
  });
  it("requires all five main slots, not duplicate legacy positions", () => {
    expect(applicationRoster(five.map(m => ({ ...m, position: 0 }))).ready).toBe(false);
  });
});
