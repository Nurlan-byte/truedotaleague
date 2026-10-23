// Server-only helpers for the Discord OAuth2 flow.
// Never import this module from client/browser code.
import { safeAuthReturn } from "./auth-return";

export const DISCORD_CALLBACK_PATH = "/api/public/auth/discord/callback";
export const STATE_COOKIE = "tdl_discord_state";
export const RETURN_COOKIE = "tdl_discord_return";

export function buildReturnCookie(next: string, state: string, maxAge: number, secure: boolean): string {
  const value = maxAge ? encodeURIComponent(`${state}:${safeAuthReturn(next)}`) : "";
  return `${RETURN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readAuthReturn(request: Request): string {
  const state = readCookie(request, STATE_COOKIE);
  try {
    const value = decodeURIComponent(readCookie(request, RETURN_COOKIE) ?? "");
    return state && value.startsWith(`${state}:`) ? safeAuthReturn(value.slice(state.length + 1)) : "/";
  } catch { return "/"; }
}

export function finishDiscordRedirect(location: string, secure: boolean): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  headers.append("set-cookie", buildStateCookie("", 0, secure));
  headers.append("set-cookie", buildReturnCookie("/", "", 0, secure));
  return new Response(null, { status: 302, headers });
}

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getDiscordConfig(request: Request): DiscordConfig | null {
  const clientId = process.env["DISCORD_CLIENT_ID"];
  const clientSecret = process.env["DISCORD_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  const origin = new URL(request.url).origin;
  const redirectUri = process.env["DISCORD_REDIRECT_URI"] || `${origin}${DISCORD_CALLBACK_PATH}`;
  return { clientId, clientSecret, redirectUri };
}

export function buildStateCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [
    `${STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const chunk of header.split(";")) {
    const [key, ...rest] = chunk.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export type DiscordUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
  verified?: boolean;
};

export function discordAvatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const index = Number(BigInt(user.id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export const FALLBACK_EMAIL_DOMAIN = "@discord.tdl.local";

export function discordEmail(user: DiscordUser): string {
  if (user.email && user.verified === true) return user.email.toLowerCase();
  return `discord_${user.id}${FALLBACK_EMAIL_DOMAIN}`;
}

export function hasVerifiedDiscordEmail(user: DiscordUser, email: string): boolean {
  return user.verified === true && !!user.email && !email.endsWith(FALLBACK_EMAIL_DOMAIN);
}
