import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  modern: false,
  error: false,
  rows: [] as unknown[],
  selects: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (selection: string) => {
        fixture.selects.push(selection);
        return { eq: () => ({ order: async () => ({ data: fixture.rows, error: null }) }) };
      },
    }),
  },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "captain" } }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/ui/dialog", () => {
  const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Box,
    DialogContent: Box,
    DialogHeader: Box,
    DialogTitle: Box,
    DialogDescription: Box,
  };
});
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey, enabled }: { queryKey: string[]; enabled?: boolean }) => ({
    data:
      queryKey[1] === "team-system"
        ? fixture.modern
        : queryKey[1] === "regulation"
          ? { id: "reg", published_at: null }
          : enabled
            ? fixture.rows
            : undefined,
    isLoading: false,
    isPending: false,
    isError: queryKey[1] === "team-system" && fixture.error,
    isSuccess: !fixture.error,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
import { ApplyDialog } from "@/components/ApplyDialog";
import {
  rosterChanged,
  staffHasTeamConflict,
  tournamentApplicationsQuery,
} from "@/lib/league-admin";

const team = {
  id: "t",
  name: "Legacy team",
  owner_id: "owner",
  team_members: [{ nickname: "das", profile_id: null, position: 0 }],
  team_captains: [{ user_id: "captain" }],
};
beforeEach(() => {
  fixture.modern = false;
  fixture.error = false;
  fixture.rows = [team];
  fixture.selects = [];
});
describe("application schema compatibility", () => {
  it("keeps existing captain application available on v1", () => {
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Legacy team");
    expect(html).toContain("Отправить заявку");
  });
  it("does not let a legacy captain apply on v2", () => {
    fixture.modern = true;
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Заявку подаёт только её создатель");
    expect(html).not.toContain("Отправить заявку");
  });
  it("keeps the owner's application available on v2", () => {
    fixture.modern = true;
    fixture.rows = [{ ...team, owner_id: "captain" }];
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Legacy team");
    expect(html).toContain("Отправить заявку");
  });
  it("fails closed when version detection errors", () => {
    fixture.error = true;
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Не удалось проверить доступ");
    expect(html).not.toContain("Отправить заявку");
  });
  it("reads legacy captain conflicts and the unchanged snapshot name", async () => {
    fixture.rows = [{ teams: team }];
    const options = tournamentApplicationsQuery("t", false);
    const rows = await options.queryFn!({} as never);
    expect(fixture.selects[0]).toContain("team_captains(user_id)");
    expect(staffHasTeamConflict(rows[0].teams, "captain", false)).toBe(true);
    expect(staffHasTeamConflict(rows[0].teams, "captain", true)).toBe(false);
    expect(rosterChanged({ members: [{ nickname: "das" }] }, rows[0].teams!.team_members)).toBe(
      false,
    );
  });
  it("v2 never requests the removed captain table and uses profile names", async () => {
    fixture.rows = [
      {
        teams: {
          ...team,
          team_members: [
            {
              id: "m",
              profile_id: "member",
              position: 0,
              profiles: { nickname: "Live", mmr: 2000 },
            },
          ],
        },
      },
    ];
    const rows = await tournamentApplicationsQuery("t", true).queryFn!({} as never);
    expect(fixture.selects[0]).not.toContain("team_captains");
    expect(rows[0].teams!.team_captains).toEqual([]);
    expect(rows[0].teams!.team_members[0].nickname).toBe("Live");
    expect(staffHasTeamConflict(rows[0].teams, "captain", false)).toBe(false);
    expect(staffHasTeamConflict(rows[0].teams, "member", false)).toBe(true);
  });
  it("does not query either schema before detection", () => {
    expect(tournamentApplicationsQuery("t", undefined).enabled).toBe(false);
  });
});
