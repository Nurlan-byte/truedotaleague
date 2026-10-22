import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Player } from "@/lib/team-invitations";
const fixture = vi.hoisted(() => ({
  players: [] as Player[],
  selected: null as Player | null,
  stateIndex: 0,
  mutation: null as null | (() => Promise<unknown>),
  rpc: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [fixture.stateIndex++ % 3 === 2 ? fixture.selected : "Player", vi.fn()],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: fixture.players }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => {
    fixture.mutation = mutationFn;
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock("@/lib/team-invitations", () => ({ teamRpc: fixture.rpc }));
import { InvitePlayer } from "@/components/TeamInvitations";
const busy: Player = { id: "busy", nickname: "BusyPlayer", mmr: 2000, already_in_team: true };
const free: Player = { id: "free", nickname: "FreePlayer", mmr: 3000, already_in_team: false };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.players = [busy, free];
  fixture.selected = null;
  fixture.stateIndex = 0;
});
describe("busy invitation search results", () => {
  it("labels busy results and disables only their selection", () => {
    const html = renderToStaticMarkup(<InvitePlayer teamId="team" disabled={false} />);
    expect(html).toContain("Уже в команде");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>BusyPlayer/);
    expect(html).toMatch(/<button(?![^>]* disabled="")[^>]*>FreePlayer/);
  });
  it("blocks a busy selection before the invitation RPC", async () => {
    fixture.selected = busy;
    renderToStaticMarkup(<InvitePlayer teamId="team" disabled={false} />);
    await expect(fixture.mutation!()).rejects.toThrow("уже в команде");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("blocks a player who became busy after selection", async () => {
    fixture.selected = free;
    fixture.players = [{ ...free, already_in_team: true }];
    renderToStaticMarkup(<InvitePlayer teamId="team" disabled={false} />);
    await expect(fixture.mutation!()).rejects.toThrow("уже в команде");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it.each([false, undefined])(
    "invites a free result with compatible busy flag %s",
    async (already_in_team) => {
      fixture.selected = { ...free, already_in_team };
      renderToStaticMarkup(<InvitePlayer teamId="team" disabled={false} />);
      await fixture.mutation!();
      expect(fixture.rpc).toHaveBeenCalledWith("invite_player", {
        p_team_id: "team",
        p_user_id: "free",
      });
    },
  );
});
