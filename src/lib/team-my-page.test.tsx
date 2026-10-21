import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  available: true,
  systemError: false,
  systemPending: false,
  teams: [] as unknown[],
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fixture.user, loading: false }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[1] === "team-system"
        ? fixture.available
        : queryKey[1] === "my-teams" || queryKey[1] === "legacy-my-teams"
          ? fixture.teams
          : [],
    isPending: queryKey[1] === "team-system" && fixture.systemPending,
    isError: queryKey[1] === "team-system" && fixture.systemError,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
import { MyTeamPage, ModernMyTeamPage } from "@/routes/my-team";
import { projectTeamMembers } from "@/lib/league-api";
import { teamErrorText } from "@/lib/team-invitations";

const team = {
  id: "alpha",
  owner_id: "owner",
  name: "Команда",
  tag: "ALPHA",
  logo_url: null,
  team_members: [
    { id: "member", profile_id: "owner", position: 0, nickname: "Капитан", mmr: 4200 },
  ],
  team_captains: [],
};
function render(teams: unknown[], user = "owner", available = true) {
  fixture.teams = teams;
  fixture.user = { id: user };
  fixture.available = available;
  fixture.systemError = false;
  fixture.systemPending = false;
  return renderToStaticMarkup(<ModernMyTeamPage />);
}
describe("deployed schema compatibility", () => {
  it("keeps the deployed create, roster and captain operations when v2 is absent", () => {
    render([team], "owner", false);
    const html = renderToStaticMarkup(<MyTeamPage />);
    expect(html).toContain("Создать команду");
    expect(html).toContain("MMR игрока команды");
    expect(html).toContain("Назначить");
    expect(html).not.toContain("Пригласить игрока");
    expect(html).not.toContain("требуется завершить обновление базы");
  });
  it("uses the preserved v2 screen after schema activation", () => {
    render([team], "owner", true);
    const html = renderToStaticMarkup(<MyTeamPage />);
    expect(html).toContain("Пригласить игрока");
    expect(html).not.toContain("Назначить");
    expect(html).not.toContain("MMR игрока команды");
  });
  it("does not select legacy writes on a failed or pending version probe", () => {
    render([team], "owner", false);
    fixture.systemError = true;
    expect(renderToStaticMarkup(<MyTeamPage />)).not.toContain("Назначить");
    fixture.systemError = false;
    fixture.systemPending = true;
    expect(renderToStaticMarkup(<MyTeamPage />)).not.toContain("Назначить");
  });
});
describe("team ownership UI", () => {
  it("allows an unaffiliated player to create a solo team using only name and tag", () => {
    const html = render([]);
    expect(html).toContain("Создать команду");
    expect(html).toContain("Название");
    expect(html).toContain("Тег");
    expect(html).not.toContain("Роль игрока");
    expect(html).not.toContain("MMR игрока");
  });
  it("hides creation from both owner and member, gives invitation controls only to owner", () => {
    const owner = render([team]);
    expect(owner).not.toContain("Создать команду");
    expect(owner).toContain("Вторую команду создать нельзя");
    expect(owner).toContain("Пригласить игрока");
  });
  it("shows member explanation without owner controls", () => {
    const html = render([team], "player");
    expect(html).toContain("Вы уже состоите в команде");
    expect(html).not.toContain("Создать команду");
    expect(html).not.toContain("Пригласить игрока");
    expect(html).not.toContain("Отправленные приглашения");
    expect(html).toContain("Покинуть команду");
  });
  it("gates all mutation controls before migration while retaining the roster", () => {
    const html = render([team], "owner", false);
    expect(html).toContain("требуется завершить обновление базы");
    expect(html).toContain("4200");
    expect(html).not.toContain("Пригласить игрока");
    expect(html).not.toContain("Удалить команду");
    expect(render([], "owner", false)).not.toContain("Создать команду");
  });
  it("uses profile values including zero MMR and never a roster snapshot", () => {
    const base = {
      team_members: [
        {
          id: "m",
          profile_id: "p",
          position: 0,
          nickname: "Old",
          mmr: 9000,
          profiles: { nickname: "New", mmr: 0 },
        },
      ],
    };
    expect(projectTeamMembers(base).team_members[0]).toMatchObject({ nickname: "New", mmr: 0 });
    expect(
      projectTeamMembers({ team_members: [{ ...base.team_members[0], profiles: null }] })
        .team_members[0].mmr,
    ).toBeNull();
  });
  it("preserves unlinked legacy names without restoring manual MMR or roles", () => {
    const legacy = projectTeamMembers({
      ...team,
      team_members: [
        {
          id: "legacy",
          profile_id: null,
          position: 0,
          nickname: "das",
          mmr: 312331,
          role: "carry",
          profiles: null,
        },
        { id: "numeric", profile_id: null, position: 1, nickname: "1", mmr: 1, profiles: null },
      ],
    });
    expect(legacy.team_members.map((member) => member.nickname)).toEqual(["das", "1"]);
    expect(legacy.team_members.every((member) => member.mmr === null)).toBe(true);
    expect(legacy.team_members[0]).not.toHaveProperty("role");
    const html = render([legacy], "owner", false);
    expect(html).toContain("das");
    expect(html).not.toContain("312331");
  });
  it("does not substitute a legacy name for a linked but inaccessible profile", () => {
    const member = { id: "m", profile_id: "p", position: 0, nickname: "Old", profiles: null };
    expect(projectTeamMembers({ team_members: [member] }).team_members[0].nickname).toBe(
      "Профиль не привязан",
    );
    expect(
      projectTeamMembers({ team_members: [{ ...member, profile_id: null, nickname: " " }] })
        .team_members[0].nickname,
    ).toBe("Профиль не привязан");
  });
  it("translates database conflicts without exposing raw backend details", () => {
    expect(teamErrorText({ message: "already_in_team" })).toContain("уже состоит");
    expect(teamErrorText({ message: "secret sql details", code: "23505" })).toContain(
      "уже существуют",
    );
    expect(teamErrorText({ message: "secret sql details" })).not.toContain("secret");
  });
});
