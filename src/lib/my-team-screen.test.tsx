import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));
import { MyTeamPage } from "../components/MyTeamPage";
function render(team?: object, migrated = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["league", "team-system", "me"], migrated);
  qc.setQueryData(["league", "my-teams", "me"], team ? [team] : []);
  qc.setQueryData(["league", "invitations", "me"], []);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(MyTeamPage)),
  );
}
const team = {
  id: "one",
  owner_id: "owner",
  name: "Existing",
  tag: "ONE",
  team_captains: [],
  team_members: [
    {
      id: "member",
      profile_id: "me",
      nickname: "Player",
      role: "Mid",
      mmr: 4000,
      roster_slot: "main",
    },
  ],
};
describe("one-team screen", () => {
  it("preserves legacy teams while new writes wait for migration", () => {
    const html = render(team, false);
    expect(html).toContain("Existing");
    expect(html).toContain("Система команд обновляется");
    expect(html).not.toContain("Создать команду");
    expect(html).not.toContain("Исключить");
    expect(html).not.toContain("Пригласить");
  });
  it("shows a creation form for a free user", () => expect(render()).toContain("Создать команду"));
  it("shows an ordinary member team and leave action without owner controls", () => {
    const html = render(team);
    expect(html).toContain("Existing");
    expect(html).toContain("Покинуть команду");
    expect(html).not.toContain("Создать команду");
    expect(html).not.toContain("Удалить команду");
    expect(html).not.toContain("Исключить");
  });
  it("lets the owner select only roster members as captain", () => {
    const html = render({
      ...team,
      owner_id: "me",
      team_members: [
        ...team.team_members,
        { id: "other", profile_id: "other", nickname: "Candidate", roster_slot: "reserve" },
      ],
    });
    expect(html).toContain("Участник для назначения капитаном");
    expect(html).toContain("Candidate");
    expect(html).toContain("Удалить команду");
    expect(html).not.toContain("Ник капитана");
    expect(html).not.toContain("Создать ссылку");
    expect(html).not.toContain("Создать команду");
  });
});
