import { createFileRoute } from "@tanstack/react-router";
import {
  buildStateCookie,
  discordAvatarUrl,
  discordEmail,
  getDiscordConfig,
  readCookie,
  STATE_COOKIE,
  type DiscordUser,
} from "@/lib/discord.server";

function fail(origin: string, code: string, secure: boolean) {
  return new Response(null, {
    status: 302,
    headers: {
      location: `${origin}/auth?discord_error=${encodeURIComponent(code)}`,
      "set-cookie": buildStateCookie("", 0, secure),
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/public/auth/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const secure = url.protocol === "https:";

        const oauthError = url.searchParams.get("error");
        if (oauthError) {
          return fail(origin, oauthError === "access_denied" ? "cancelled" : "oauth_error", secure);
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const expectedState = readCookie(request, STATE_COOKIE);
        if (!code) return fail(origin, "no_code", secure);
        if (!state || !expectedState || state !== expectedState) {
          return fail(origin, "bad_state", secure);
        }

        const config = getDiscordConfig(request);
        if (!config) return fail(origin, "not_configured", secure);

        // 1. Exchange the authorization code for an access token.
        let accessToken: string;
        try {
          const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              grant_type: "authorization_code",
              code,
              redirect_uri: config.redirectUri,
            }),
          });
          if (!tokenRes.ok) {
            console.error("discord token exchange failed", tokenRes.status, await tokenRes.text());
            return fail(origin, "invalid_code", secure);
          }
          const token = (await tokenRes.json()) as { access_token?: string };
          if (!token.access_token) return fail(origin, "invalid_code", secure);
          accessToken = token.access_token;
        } catch (e) {
          console.error("discord token exchange error", e);
          return fail(origin, "invalid_code", secure);
        }

        // 2. Load the Discord profile.
        let discordUser: DiscordUser;
        try {
          const meRes = await fetch("https://discord.com/api/users/@me", {
            headers: { authorization: `Bearer ${accessToken}` },
          });
          if (!meRes.ok) {
            console.error("discord profile failed", meRes.status);
            return fail(origin, "profile_failed", secure);
          }
          discordUser = (await meRes.json()) as DiscordUser;
          if (!discordUser?.id) return fail(origin, "profile_failed", secure);
        } catch (e) {
          console.error("discord profile error", e);
          return fail(origin, "profile_failed", secure);
        }

        const email = discordEmail(discordUser);
        const displayName =
          discordUser.global_name?.trim() || discordUser.username || `player_${discordUser.id}`;
        const avatar = discordAvatarUrl(discordUser);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 3. Find an existing account linked to this Discord ID (or e-mail).
          const { data: linked } = await supabaseAdmin
            .from("profiles")
            .select("id, nickname, avatar_url")
            .eq("discord_id", discordUser.id)
            .maybeSingle();

          let userId = linked?.id ?? null;
          let authEmail = email;

          if (!userId) {
            const created = await supabaseAdmin.auth.admin.createUser({
              email,
              email_confirm: true,
              user_metadata: {
                nickname: displayName,
                avatar_url: avatar,
                discord_id: discordUser.id,
                discord_username: discordUser.username,
                discord_global_name: discordUser.global_name ?? "",
                provider: "discord",
              },
            });
            if (created.data?.user) {
              userId = created.data.user.id;
            } else {
              // The e-mail already belongs to an account (e.g. Google sign-in
              // with the same address) — link Discord to it instead.
              let page = 1;
              while (!userId && page <= 20) {
                const list = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
                if (list.error) break;
                const match = list.data.users.find(
                  (u) => (u.email ?? "").toLowerCase() === email,
                );
                if (match) userId = match.id;
                if (list.data.users.length < 200) break;
                page += 1;
              }
              if (!userId) {
                console.error("discord user create failed", created.error);
                return fail(origin, "user_failed", secure);
              }
            }
          } else {
            const existing = await supabaseAdmin.auth.admin.getUserById(userId);
            if (existing.data?.user?.email) authEmail = existing.data.user.email.toLowerCase();
          }

          // 4. Keep the profile in sync with Discord.
          await supabaseAdmin
            .from("profiles")
            .upsert(
              {
                id: userId,
                discord_id: discordUser.id,
                discord_username: discordUser.username,
                discord_global_name: discordUser.global_name ?? "",
                ...(linked?.nickname ? {} : { nickname: displayName }),
                ...(linked?.avatar_url ? {} : { avatar_url: avatar }),
              },
              { onConflict: "id" },
            );

          // 5. Mint a one-time link and let the browser turn it into a session.
          const link = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: authEmail,
          });
          const tokenHash = link.data?.properties?.hashed_token;
          if (!tokenHash) {
            console.error("discord session link failed", link.error);
            return fail(origin, "session_failed", secure);
          }

          return new Response(null, {
            status: 302,
            headers: {
              location: `${origin}/auth-discord?token_hash=${encodeURIComponent(tokenHash)}`,
              "set-cookie": buildStateCookie("", 0, secure),
              "cache-control": "no-store",
            },
          });
        } catch (e) {
          console.error("discord login error", e);
          return fail(origin, "user_failed", secure);
        }
      },
    },
  },
});
