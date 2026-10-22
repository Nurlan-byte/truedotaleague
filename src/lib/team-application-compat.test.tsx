import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  modern: false,
  error: false,
  rows: [] as unknown[],
  selects: [] as string[],
  loading: false,
  fetching: false,
  mutation: null as null | (() => Promise<unknown>),
  rpc: vi.fn(async () => ({ data: {}, error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: fixture.rpc,
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
    isLoading: fixture.loading,
    isFetching: fixture.fetching,
    isPending: false,
    isError: queryKey[1] === "team-system" && fixture.error,
    isSuccess: !fixture.error,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => {
    fixture.mutation = mutationFn;
    return { isPending: false, mutate: vi.fn() };
  },
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
  fixture.loading = false;
  fixture.fetching = false;
  fixture.rpc.mockClear();
});
describe("application schema compatibility", () => {
  const renderDialog = () => renderToStaticMarkup(<ApplyDialog tournamentId="cup" title="Cup" open onOpenChange={() => {}} />);
  const fullTeam = () => ({ ...team, owner_id: "captain", tag: "TAG", team_members: Array.from({ length: 5 }, (_, position) => ({ profile_id: `p${position}`, position })) });
  it("has no submission for zero owned teams", async () => {
    fixture.modern = true; fixture.rows = [];
    expect(renderDialog()).not.toContain("Отправить заявку");
    await expect(fixture.mutation!()).rejects.toThrow();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("automatically submits the single owner's team id", async () => {
    fixture.modern = true; fixture.rows = [fullTeam()];
    const html = renderDialog();
    expect(html).toContain("TAG");
    expect(html).not.toContain("combobox");
    await fixture.mutation!();
    expect(fixture.rpc).toHaveBeenCalledWith("submit_application", expect.objectContaining({ p_team_id: "t" }));
  });
  it("blocks multiple legacy owned teams instead of choosing one", async () => {
    fixture.modern = true; fixture.rows = [fullTeam(), { ...fullTeam(), id: "second" }];
    expect(renderDialog()).toContain("Найдено несколько ваших команд");
    await expect(fixture.mutation!()).rejects.toThrow();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("shows loading rather than a false missing-team state", () => {
    fixture.modern = true; fixture.rows = []; fixture.loading = true;
    expect(renderDialog()).toContain("Загружаем");
  });
  it("blocks submission during roster refetch and after ownership changes", async () => {
    fixture.modern = true; fixture.rows = [fullTeam()]; fixture.fetching = true;
    renderDialog(); await expect(fixture.mutation!()).rejects.toThrow();
    fixture.fetching = false; fixture.rows = [{ ...fullTeam(), owner_id: "other" }];
    renderDialog(); await expect(fixture.mutation!()).rejects.toThrow();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("still blocks a unique owner with fewer than five main players", async () => {
    fixture.modern = true; fixture.rows = [{ ...team, owner_id: "captain" }];
    renderDialog(); await expect(fixture.mutation!()).rejects.toThrow("minimum_five_main_players");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("blocks applications without the invitations backend", () => {
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Подача заявок пока недоступна");
    expect(html).not.toContain("Отправить заявку");
    expect(html).not.toContain("владелец или капитан");
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
    expect(html).toContain('Legacy team');
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain("Отправить заявку");
  });
  it("does not grant application rights to a linked roster member", () => {
    fixture.modern = true;
    fixture.rows = [{ ...team, team_captains: [], team_members: [{ profile_id: "captain" }] }];
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).not.toContain("Отправить заявку");
    expect(html).toContain("Заявку подаёт только её создатель");
  });
  it("blocks even an owner while the backend is absent", () => {
    fixture.rows = [{ ...team, owner_id: "captain" }];
    const html = renderToStaticMarkup(
      <ApplyDialog tournamentId="tournament" title="Cup" open onOpenChange={() => {}} />,
    );
    expect(html).toContain("Подача заявок пока недоступна");
    expect(html).not.toContain("Отправить заявку");
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
