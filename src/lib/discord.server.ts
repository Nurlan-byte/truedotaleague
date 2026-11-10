// Server-only helpers for the Discord OAuth2 flow.
// Never import this module from client/browser code.

export const DISCORD_CALLBACK_PATH = "/api/public/auth/discord/callback";
export const STATE_COOKIE = "tdl_discord_state";

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

export const DISCORD_GUILD_ID = "1439794512762245233";

/**
 * Reads the player's "Competitive Rating N" role on the league Discord server.
 * Returns the highest N, null when the player has no such role, or undefined
 * when the lookup failed (so existing data is kept).
 */
export async function fetchCompetitiveRating(discordUserId: string): Promise<number | null | undefined> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) return undefined;
  const headers = { authorization: `Bot ${token}` };
  try {
    const memberRes = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`,
      { headers },
    );
    if (memberRes.status === 404) return null;
    if (!memberRes.ok) return undefined;
    const member = (await memberRes.json()) as { roles?: string[] };
    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/roles`, { headers });
    if (!rolesRes.ok) return undefined;
    const roles = (await rolesRes.json()) as { id: string; name: string }[];
    const mine = new Set(member.roles ?? []);
    let best: number | null = null;
    for (const r of roles) {
      if (!mine.has(r.id)) continue;
      const m = /^competitive rating\s+(\d+)/i.exec(r.name.trim());
      if (m) best = Math.max(best ?? 0, Number(m[1]));
    }
    return best;
  } catch {
    return undefined;
  }
}
