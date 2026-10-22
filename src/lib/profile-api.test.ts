import { describe, expect, it } from "vitest";
import { profilePayload, profileError, teamsForProfile, verificationResult } from "./profile-api";

const valid = {
  nickname: " Игрок ",
  mmr: "4200",
  profileUrl: "https://www.dotabuff.com/players/123",
  position: "",
  bio: "",
  lookingForTeam: false,
};
describe("profile review input", () => {
  it("requires nickname, MMR and an external profile without accepting team or verification input", () => {
    expect(profilePayload(valid)).toEqual({
      p_nickname: "Игрок",
      p_mmr: 4200,
      p_profile_url: valid.profileUrl,
      p_role_position: "",
      p_bio: "",
      p_looking_for_team: false,
    });
    expect(() => profilePayload({ ...valid, mmr: "" })).toThrow("Укажите MMR");
    expect(() => profilePayload({ ...valid, nickname: "x" })).toThrow("Никнейм");
    expect(() => profilePayload({ ...valid, profileUrl: "" })).toThrow("ссылку");
    expect(() => profilePayload({ ...valid, profileUrl: "javascript:alert(1)" })).toThrow("ссылку");
    expect(() => profilePayload({ ...valid, mmr: "12.5" })).toThrow("целым");
    expect(() => profilePayload({ ...valid, mmr: "15001" })).toThrow("15000");
    expect(profilePayload({ ...valid, mmr: "0" }).p_mmr).toBe(0);
  });
  it("does not invent successful verification when backend status is missing", () => {
    expect(() => verificationResult(null)).toThrow();
    expect(() => verificationResult({ status: "approved" })).toThrow();
    expect(verificationResult({ status: "pending", submitted_at: "2026-10-22" }).status).toBe(
      "pending",
    );
    expect(profileError({ code: "PGRST202" })).toContain("пока недоступна");
    expect(profileError({ message: "self_review_forbidden" })).toContain("собственный");
    expect(profileError({ message: "cannot_review_own_profile" })).toContain("собственный");
    expect(profileError({ message: "stale_review" })).toContain("изменилась");
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
