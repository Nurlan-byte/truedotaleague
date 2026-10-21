import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, { data: unknown[] | null; error: unknown }>,
  insert: vi.fn(),
  eq: vi.fn(),
  eligible: true as boolean | undefined,
  pending: false,
  error: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => {
          state.eq(table, column, value);
          return { limit: () => Promise.resolve(state.rows[table]) };
        },
      }),
      insert: state.insert,
    }),
  },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "player" }, loading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[1] === "legacy-team-eligibility"
      ? {
          data: state.eligible,
          isPending: state.pending,
          isError: state.error,
          refetch: vi.fn(),
        }
      : { data: [], isPending: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
import { LegacyMyTeam } from "@/components/LegacyMyTeam";
import {
  createLegacyTeam,
  fetchLegacyTeamEligibility,
  TEAM_ASSOCIATED_TEXT,
  TEAM_ELIGIBILITY_ERROR,
} from "@/lib/legacy-team-api";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = Object.fromEntries(
    ["teams", "team_captains", "team_members"].map((table) => [table, { data: [], error: null }]),
  );
  state.insert.mockResolvedValue({ error: null });
  state.eligible = true;
  state.pending = false;
  state.error = false;
});

describe("legacy team creation guard", () => {
  it.each(["teams", "team_captains", "team_members"])(
    "blocks association through %s without granting management access",
    async (table) => {
      state.rows[table].data = [{ id: "existing" }];
      expect(await fetchLegacyTeamEligibility("player")).toBe(false);
      await expect(createLegacyTeam("player", "New", "NEW")).rejects.toThrow(TEAM_ASSOCIATED_TEXT);
      expect(state.insert).not.toHaveBeenCalled();
      state.eligible = false;
      const html = renderToStaticMarkup(<LegacyMyTeam />);
      expect(html).toContain(TEAM_ASSOCIATED_TEXT);
      expect(html).toMatch(/<button[^>]*disabled=""/);
      expect(html).not.toContain("Назначить");
    },
  );
  it("checks all three associations and inserts only when none exist", async () => {
    expect(await fetchLegacyTeamEligibility("player")).toBe(true);
    await createLegacyTeam("player", " New ", " NEW ");
    expect(state.eq).toHaveBeenCalledWith("teams", "owner_id", "player");
    expect(state.eq).toHaveBeenCalledWith("team_captains", "user_id", "player");
    expect(state.eq).toHaveBeenCalledWith("team_members", "profile_id", "player");
    expect(state.insert).toHaveBeenCalledWith({ name: "New", tag: "NEW", owner_id: "player" });
    expect(renderToStaticMarkup(<LegacyMyTeam />)).not.toMatch(/<button[^>]*disabled=""/);
  });
  it("rereads associations at submission instead of trusting earlier eligibility", async () => {
    expect(await fetchLegacyTeamEligibility("player")).toBe(true);
    state.rows.team_members.data = [{ id: "joined" }];
    await expect(createLegacyTeam("player", "New", "N")).rejects.toThrow(TEAM_ASSOCIATED_TEXT);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it.each(["teams", "team_captains", "team_members"])(
    "never inserts when the %s check fails",
    async (table) => {
      state.rows[table] = { data: null, error: { message: "network" } };
      await expect(createLegacyTeam("player", "New", "N")).rejects.toThrow(TEAM_ELIGIBILITY_ERROR);
      expect(state.insert).not.toHaveBeenCalled();
    },
  );
  it("fails closed while loading or after a failed refresh even with cached permission", () => {
    state.pending = true;
    expect(renderToStaticMarkup(<LegacyMyTeam />)).toMatch(/<button[^>]*disabled=""/);
    state.pending = false;
    state.error = true;
    const html = renderToStaticMarkup(<LegacyMyTeam />);
    expect(html).toContain(TEAM_ELIGIBILITY_ERROR);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
  it.each(["team_already_associated", "already_in_team"])(
    "explains database rejection %s in Russian",
    async (message) => {
      state.insert.mockResolvedValue({ error: { message } });
      await expect(createLegacyTeam("player", "New", "N")).rejects.toThrow(TEAM_ASSOCIATED_TEXT);
    },
  );
});
