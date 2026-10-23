import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({
  queries: [] as string[][],
  rpc: vi.fn(async () => ({ data: {}, error: null })),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "player" }, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fixture.rpc } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    fixture.queries.push(queryKey);
    return { data: [], isPending: false, isError: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { ProfilePage } from "@/routes/profile";
import { saveProfile } from "./profile-api";

describe("profile without moderation workflow", () => {
  it("does not request verification or render approval/status gates", () => {
    fixture.queries = [];
    const html = renderToStaticMarkup(<ProfilePage />);
    expect(html).toContain("Сохранить профиль");
    for (const text of ["Верификация", "верифицирован", "на проверку", "проверить другой"])
      expect(html).not.toContain(text);
    expect(
      fixture.queries.every((key) => !key.includes("verification") && !key.includes("reviews")),
    ).toBe(true);
  });
  it("saves without any status response and never sends review, role or membership fields", async () => {
    fixture.rpc.mockClear();
    await saveProfile({
      nickname: "Player",
      mmr: "",
      profileUrl: "",
      position: "",
      bio: "",
      lookingForTeam: false,
    });
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith("save_profile_for_review", {
      p_nickname: "Player",
      p_mmr: null,
      p_profile_url: "",
      p_role_position: "",
      p_bio: "",
      p_looking_for_team: false,
    });
  });
});
