import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  user: null as { id: string } | null,
  teams: [] as unknown[],
  teamError: false,
  previewStatus: "pending",
  previewError: false,
  mutation: null as null | (() => Promise<unknown>),
  rpc: vi.fn(async () => ({ data: { team_id: "team", status: "accepted" }, error: null as null | { code?: string; message?: string } })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fixture.user, loading: false }) }));
vi.mock("@tanstack/react-router", async original => ({ ...(await original<typeof import("@tanstack/react-router")>()), createFileRoute: () => (options: unknown) => options }));
vi.mock("@/components/ui/dialog", () => {
  const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Dialog: Box, DialogContent: Box, DialogHeader: Box, DialogTitle: Box, DialogDescription: Box };
});
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[1] === "invite-link-preview" ? { name: "Public team", tag: "TAG", team_id: "team", status: fixture.previewStatus } : fixture.teams,
    isPending: false, isFetching: false,
    isError: queryKey[1] === "invite-link-preview" ? fixture.previewError : fixture.teamError,
    error: new Error("Приглашения по ссылке пока недоступны"), refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => {
    fixture.mutation = mutationFn;
    return { isPending: false, mutate: vi.fn() };
  },
}));
import { JoinTeamInvitation } from "@/routes/join";
import { inviteDismissalKey, inviteLinkError, inviteLinkRpc, inviteLoginHref, inviteReturnPath, validInviteToken } from "./team-invite-links";
const token = "a".repeat(64);
const render = () => renderToStaticMarkup(<JoinTeamInvitation token={token} />);
beforeEach(() => { fixture.user = null; fixture.teams = []; fixture.teamError = false; fixture.previewStatus = "pending"; fixture.previewError = false; fixture.rpc.mockClear(); fixture.rpc.mockResolvedValue({ data: { team_id: "team", status: "accepted" }, error: null }); });
describe("invitation link safety", () => {
  it("only builds local login return targets from fixed-format tokens", () => {
    expect(inviteReturnPath(token)).toBe(`/join?token=${token}`);
    expect(inviteLoginHref(token)).toBe(`/auth?next=${encodeURIComponent(`/join?token=${token}`)}`);
    for (const bad of ["https://evil.test", "//evil.test", "a".repeat(63), "A".repeat(64), token + "&next=https://evil.test"])
      expect(validInviteToken(bad)).toBe(false);
    expect(() => inviteLoginHref("//evil.test")).toThrow();
  });
  it("does not accept on render and requires login first", async () => {
    const html = render();
    expect(html).toContain("Войти через Discord");
    expect(html).toContain("Public team");
    expect(html).toContain("next=%2Fjoin%3Ftoken%3D");
    expect(fixture.rpc).not.toHaveBeenCalled();
    await expect(fixture.mutation!()).rejects.toThrow();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("accepts only an explicit action by a free logged-in player", async () => {
    fixture.user = { id: "free" }; render();
    expect(fixture.rpc).not.toHaveBeenCalled();
    await fixture.mutation!();
    expect(fixture.rpc).toHaveBeenCalledWith("accept_team_invite_link", { p_token: token });
  });
  it("blocks members, owners, lookup errors, and revoked or used links", async () => {
    fixture.user = { id: "account" };
    for (const team of [{ owner_id: "other" }, { owner_id: "account" }]) {
      fixture.teams = [team]; expect(render()).toContain("Вы уже состоите в команде");
      await expect(fixture.mutation!()).rejects.toThrow();
    }
    fixture.teams = []; fixture.teamError = true; render();
    await expect(fixture.mutation!()).rejects.toThrow();
    fixture.teamError = false;
    for (const status of ["accepted", "revoked", "unavailable"]) {
      fixture.previewStatus = status; render(); await expect(fixture.mutation!()).rejects.toThrow();
    }
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("stores only a token digest in account-specific decline keys", async () => {
    const key = await inviteDismissalKey(token, "user");
    expect(key).not.toContain(token);
    expect(key).toBe(await inviteDismissalKey(token, "user"));
    expect(key).not.toBe(await inviteDismissalKey(token, "other"));
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("reports backend unavailable and capacity without legacy writes", async () => {
    expect(inviteLinkError({ code: "PGRST202" })).toContain("пока недоступны");
    expect(inviteLinkError({ message: "team_full" })).toContain("5 основных");
    expect(inviteLinkError({ message: "invitation_link_used" })).toContain("использована");
    fixture.rpc.mockResolvedValueOnce({ data: { team_id: "", status: "" }, error: { code: "PGRST202" } });
    await expect(inviteLinkRpc("accept_team_invite_link", { p_token: token })).rejects.toThrow("пока недоступны");
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
});
