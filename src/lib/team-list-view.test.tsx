import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamList, type TeamListItem } from "@/components/TeamList";

const team: TeamListItem = {
  id: "team-a",
  name: "Команда Альфа",
  tag: "ALPHA",
  logo_url: null,
  owner_id: "owner",
  team_members: [
    { id: "second", profile_id: "player", position: 1, nickname: "Игрок второй", mmr: null },
    { id: "first", profile_id: "owner", position: 0, nickname: "Капитан первый", mmr: 4200 },
  ],
};

describe("team list disclosure", () => {
  it("starts collapsed without revealing player names, with an accessible trigger and count", () => {
    const html = renderToStaticMarkup(<TeamList teams={[team]} />);
    expect(html).toContain("Команда Альфа");
    expect(html).toContain('aria-label="Игроков: 2"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('id="team-trigger-team-a"');
    expect(html).toContain('aria-controls="team-roster-team-a"');
    expect(html).toContain('id="team-roster-team-a"');
    expect(html).toContain('aria-labelledby="team-trigger-team-a"');
    expect(html).not.toContain("Капитан первый");
    expect(html).not.toContain("Игрок второй");
  });

  it("reveals profile MMR, owner badge and ordered members when expanded", () => {
    const html = renderToStaticMarkup(<TeamList teams={[team]} defaultValue={[team.id]} />);
    expect(html).toContain('aria-expanded="true"');
    expect(html.indexOf("Капитан первый")).toBeLessThan(html.indexOf("Игрок второй"));
    expect(html).toContain("4 200 MMR");
    expect(html).toContain("MMR не указан");
    expect(html.match(/Капитан<\/span>/g)).toHaveLength(1);
  });

  it("renders a zero profile MMR without treating it as missing", () => {
    const html = renderToStaticMarkup(
      <TeamList
        teams={[{ ...team, team_members: [{ ...team.team_members[0], mmr: 0 }] }]}
        defaultValue={[team.id]}
      />,
    );
    expect(html).toContain("0 MMR");
    expect(html).not.toContain("MMR не указан");
  });
});
