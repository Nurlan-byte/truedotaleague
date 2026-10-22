import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ teams: [] as unknown[], pending: false, error: false }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "player" }, loading: false }),
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({
    data: state.teams,
    isPending: state.pending,
    isError: state.error,
    refetch: vi.fn(),
  }),
}));
import { LegacyMyTeam } from "@/components/LegacyMyTeam";
import { projectTeamMembers } from "@/lib/league-api";

describe("legacy backend is read-only until invitations are available", () => {
  it.each(["owner", "captain", "member"])("never exposes manual writes for %s", () => {
    state.teams = [];
    const html = renderToStaticMarkup(<LegacyMyTeam />);
    expect(html).toContain("Приглашения игроков пока недоступны");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Назначить");
    expect(html).not.toContain("Создать команду");
  });
  it("preserves unlinked rows and uses live profile MMR without snapshot fallback", () => {
    state.teams = [
      projectTeamMembers({
        id: "team",
        name: "Existing",
        tag: "OLD",
        logo_url: null,
        team_members: [
          { id: "old", profile_id: null, position: 1, nickname: "das", mmr: 9999, profiles: null },
          {
            id: "live",
            profile_id: "p",
            position: 0,
            nickname: "Snapshot",
            mmr: 9999,
            profiles: { nickname: "Live", mmr: 4200 },
          },
        ],
      }),
    ];
    const html = renderToStaticMarkup(<LegacyMyTeam />);
    expect(html).toContain("das");
    expect(html).toContain("Live");
    expect(html).toContain("4200");
    expect(html).not.toContain("9999");
    expect(html).not.toContain("Snapshot");
    expect(html).not.toContain("<input");
  });
});
