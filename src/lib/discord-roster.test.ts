import { describe, expect, it, vi } from "vitest";
import { rosterPayload, writeRosterMessage } from "./discord-roster";

describe("one Discord roster per tournament", () => {
  it("edits the same message when another team is accepted", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ id: "123" })));
    const first = rosterPayload("Rising Cup #1", "cup", [{ id: "a", name: "Aura", players: [] }]);
    await writeRosterMessage("https://discord.test/webhook", "123", first, request);
    await writeRosterMessage("https://discord.test/webhook", "123", rosterPayload("Rising Cup #1", "cup", [{ id: "a", name: "Aura", players: [] }, { id: "b", name: "AliAqs", players: [] }]), request);
    expect(request.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://discord.test/webhook/messages/123", "PATCH"], ["https://discord.test/webhook/messages/123", "PATCH"],
    ]);
  });
  it("keeps the remaining teams when one withdraws", () => {
    const result = rosterPayload("Rising Cup #1", "cup", [{ id: "b", name: "AliAqs", players: [{ name: "Captain", rating: 3500, captain: true, position: 0 }] }]);
    expect(result.payload.embeds[0]?.description).toContain("AliAqs");
    expect(result.payload.embeds[0]?.description).not.toContain("Aura");
  });
  it("recreates only a message deleted in Discord", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "456" })));
    expect(await writeRosterMessage("https://discord.test/webhook", "123", rosterPayload("Cup", "cup", []), request)).toBe("456");
    expect(request.mock.calls[1]?.[1]?.method).toBe("POST");
  });
  it("preserves all rosters in an attachment when Discord's single-message limit is exceeded", () => {
    const teams = Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, name: `Team ${i}`, players: Array.from({ length: 7 }, (_, position) => ({ name: "Long player nickname", rating: 4000, captain: position === 0, position })) }));
    const result = rosterPayload("Cup", "cup", teams);
    expect(result.fullList).toContain("Team 39");
    expect(result.payload.attachments).toHaveLength(1);
  });
});