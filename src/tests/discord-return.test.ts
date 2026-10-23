import { afterEach, describe, expect, it, vi } from "vitest";
import { authRetryUrl, completeDiscordLogin, safeAuthReturn } from "@/lib/auth-return";
import { readAuthReturn, buildReturnCookie } from "@/lib/discord.server";
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
import { Route as Start } from "@/routes/api/public/auth/discord/start";
import { Route as Callback } from "@/routes/api/public/auth/discord/callback";
type Handler = { server: { handlers: { GET: (args: { request: Request }) => Promise<Response> } } };
const start = (Start as unknown as Handler).server.handlers.GET;
const callback = (Callback as unknown as Handler).server.handlers.GET;
const next = `/join?token=${"a".repeat(64)}`;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Discord-only safe invitation return", () => {
  it("returns to invite only after the OTP successfully establishes a session", async () => {
    const verify = vi.fn().mockResolvedValue({ error: null });
    await expect(completeDiscordLogin(`?token_hash=one-time&next=${encodeURIComponent(next)}`, verify)).resolves.toBe(next);
    expect(verify).toHaveBeenCalledWith({ type: "email", token_hash: "one-time" });
  });
  it("never reports success for a missing, expired or rejected OTP", async () => {
    const verify = vi.fn().mockResolvedValue({ error: new Error("expired") });
    await expect(completeDiscordLogin(`?next=${encodeURIComponent(next)}`, verify)).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
    await expect(completeDiscordLogin("?token_hash=expired", verify)).rejects.toThrow();
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/join?token=bad", next + "&next=https://evil.test", "/admin", "%2f%2fevil.test", null])("rejects unsafe target %s", value => {
    expect(safeAuthReturn(value)).toBe("/");
  });
  it("keeps only a valid same-site invitation target", () => {
    expect(safeAuthReturn(next)).toBe(next);
    expect(new URL(authRetryUrl(next,"cancelled"),"https://tdl.test").searchParams.get("next")).toBe(next);
  });
  it("binds return cookie to the current state", () => {
    const cookie = buildReturnCookie(next,"state",600,true).split(";")[0];
    expect(readAuthReturn(new Request("https://tdl.test",{headers:{cookie:`tdl_discord_state=state; ${cookie}`}}))).toBe(next);
    expect(readAuthReturn(new Request("https://tdl.test",{headers:{cookie:`tdl_discord_state=other; ${cookie}`}}))).toBe("/");
  });
  it("starts Discord with state and HttpOnly local return, without leaking invite to provider", async () => {
    vi.stubEnv("DISCORD_CLIENT_ID","test"); vi.stubEnv("DISCORD_CLIENT_SECRET","test");
    const response=await start({request:new Request(`https://tdl.test/api/public/auth/discord/start?next=${encodeURIComponent(next)}`)});
    const location=new URL(response.headers.get("location")!);
    expect(location.hostname).toBe("discord.com");
    expect(location.searchParams.get("scope")).toBe("identify email");
    expect(location.toString()).not.toContain("token");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("tdl_discord_return");
  });
  it.each([['error=access_denied','cancelled'],['error=server_error','oauth_error'],['','no_code'],['code=x&state=wrong','bad_state']])("preserves invitation on %s without exchanging a code",async(query,error)=>{
    const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
    const cookie=buildReturnCookie(next,"s",600,true).split(";")[0];
    const response=await callback({request:new Request(`https://tdl.test/api/public/auth/discord/callback?${query}`,{headers:{cookie:`tdl_discord_state=s; ${cookie}`}})});
    const location=new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth");expect(location.searchParams.get("next")).toBe(next);
    expect(location.searchParams.get("discord_error")).toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
