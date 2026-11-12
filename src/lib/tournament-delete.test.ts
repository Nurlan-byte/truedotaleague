import { describe, expect, it, vi } from "vitest";
import { deleteTournament } from "./tournament-delete";

describe("complete tournament deletion", () => {
  it("does not remove Discord rosters when admin permission is denied", async () => {
    const cleanup = vi.fn();
    await expect(deleteTournament("cup", 3, async () => ({ error: { message: "forbidden" } }), cleanup)).rejects.toEqual({ message: "forbidden" });
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("passes the confirmed tournament and version, then removes its Discord rosters", async () => {
    const calls: string[] = [];
    const remove = vi.fn(async () => { calls.push("delete"); return { error: null }; });
    const result = await deleteTournament("cup", 7, remove, async () => { calls.push("cleanup"); return {}; });
    expect(remove).toHaveBeenCalledWith({ p_id: "cup", p_expected_version: 7 });
    expect(calls).toEqual(["delete", "cleanup"]);
    expect(result.discordCleanupFailed).toBe(false);
  });
  it("reports Discord failure without pretending the tournament deletion failed", async () => {
    const result = await deleteTournament("cup", 1, async () => ({ error: null }), async () => { throw new Error("offline"); });
    expect(result.discordCleanupFailed).toBe(true);
  });
});