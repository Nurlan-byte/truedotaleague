import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  profile: { id: "existing", nickname: "Reviewed", avatar_url: "saved.png" } as {
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null,
  profileError: null as unknown,
  upsert: vi.fn(),
  update: vi.fn(),
  generateLink: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (column: string) => ({
          maybeSingle: async () =>
            column === "discord_id"
              ? { data: null, error: null }
              : { data: fixture.profile, error: fixture.profileError },
        }),
      }),
      upsert: fixture.upsert,
      update: (payload: unknown) => {
        fixture.update(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
    auth: {
      admin: {
        createUser: async () => ({ data: {}, error: { message: "already exists" } }),
        listUsers: async () => ({
          data: { users: [{ id: "existing", email: "player@example.test" }] },
        }),
        generateLink: fixture.generateLink,
      },
    },
  },
}));
import { Route } from "@/routes/api/public/auth/discord/callback";
import { buildReturnCookie } from "@/lib/discord.server";
const callback = (
  Route as unknown as {
    server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.GET;
const request = () =>
  new Request("https://example.test/api/public/auth/discord/callback?code=code&state=s", {
    headers: { cookie: "tdl_discord_state=s" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  fixture.profile = { id: "existing", nickname: "Reviewed", avatar_url: "saved.png" };
  fixture.profileError = null;
  fixture.upsert.mockResolvedValue({ error: null });
  fixture.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "session" } } });
  vi.stubEnv("DISCORD_CLIENT_ID", "test");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "test");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "123",
          username: "DiscordName",
          global_name: "OAuthName",
          avatar: null,
          email: "player@example.test",
          verified: true,
        }),
      ),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Discord e-mail linking preserves reviewed profile data", () => {
  it("returns the invitation after successful mocked OAuth exchange", async () => {
    const next = `/join?token=${"a".repeat(64)}`;
    const cookie = buildReturnCookie(next, "s", 600, true).split(";")[0];
    const response = await callback({ request: new Request("https://example.test/api/public/auth/discord/callback?code=code&state=s", {
      headers: { cookie: `tdl_discord_state=s; ${cookie}` },
    }) });
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/auth-discord");
    expect(target.searchParams.get("next")).toBe(next);
    expect(target.searchParams.get("token_hash")).toBe("session");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it.each(["Reviewed", ""])(
    "preserves existing nickname %j and avatar instead of OAuth defaults",
    async (nickname) => {
      fixture.profile = { id: "existing", nickname, avatar_url: null };
      const response = await callback({ request: request() });
      expect(response.headers.get("location")).toContain("auth-discord?token_hash=session");
      expect(fixture.upsert).not.toHaveBeenCalled();
      expect(fixture.update).toHaveBeenCalledExactlyOnceWith({
        discord_id: "123",
        discord_username: "DiscordName",
        discord_global_name: "OAuthName",
      });
    },
  );
  it("fails closed if the resolved profile cannot be read", async () => {
    fixture.profileError = { message: "database unavailable" };
    const response = await callback({ request: request() });
    expect(response.headers.get("location")).toContain("discord_error=user_failed");
    expect(fixture.upsert).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.generateLink).not.toHaveBeenCalled();
  });
  it("initializes only missing profiles without overwriting a concurrent insert", async () => {
    fixture.profile = null;
    await callback({ request: request() });
    expect(fixture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "existing", nickname: "OAuthName" }),
      { onConflict: "id", ignoreDuplicates: true },
    );
    expect(fixture.update.mock.calls[0][0]).not.toHaveProperty("nickname");
    expect(fixture.update.mock.calls[0][0]).not.toHaveProperty("avatar_url");
  });
});
