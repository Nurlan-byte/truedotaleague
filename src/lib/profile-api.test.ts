import { describe, expect, it } from "vitest";
import { profilePayload, profileError, teamsForProfile } from "./profile-api";

const valid = {
  nickname: " Игрок ",
  mmr: "4200",
  profileUrl: "https://www.dotabuff.com/players/123",
  position: "",
  bio: "",
  lookingForTeam: false,
};
describe("profile input without review", () => {
  it("validates supplied fields without requiring MMR, external profile or verification", () => {
    expect(profilePayload(valid)).toEqual({
      p_nickname: "Игрок",
      p_mmr: 4200,
      p_profile_url: valid.profileUrl,
      p_role_position: "",
      p_bio: "",
      p_looking_for_team: false,
    });
    expect(profilePayload({ ...valid, mmr: "", profileUrl: "" })).toMatchObject({
      p_mmr: null,
      p_profile_url: "",
    });
    expect(() => profilePayload({ ...valid, nickname: "x" })).toThrow("Никнейм");
    expect(() => profilePayload({ ...valid, profileUrl: "javascript:alert(1)" })).toThrow("ссылку");
    expect(() => profilePayload({ ...valid, mmr: "12.5" })).toThrow("целым");
    expect(() => profilePayload({ ...valid, mmr: "15001" })).toThrow("15000");
    expect(profilePayload({ ...valid, mmr: "0" }).p_mmr).toBe(0);
  });
  it("retains authentication errors and does not expose raw server errors", () => {
    expect(profileError({ code: "PGRST202" })).toContain("пока недоступно");
    expect(profileError({ message: "not_authenticated" })).toContain("Войдите");
    expect(profileError({ message: "secret database error" })).not.toContain("secret");
  });
});
describe("derived profile teams", () => {
  const teams = [
    { id: "a", name: "Same", tag: "A", owner_id: "u", team_members: [] },
    { id: "b", name: "Same", tag: "B", owner_id: "other", team_members: [{ profile_id: "u" }] },
    { id: "c", name: "Same", tag: "C", owner_id: "third", team_members: [{ profile_id: null }] },
  ];
  it("keeps every real owner/member conflict without matching by nickname or team name", () => {
    expect(teamsForProfile(teams, "u").map((t) => t.id)).toEqual(["a", "b"]);
    expect(teamsForProfile(teams, "missing")).toEqual([]);
  });
});
