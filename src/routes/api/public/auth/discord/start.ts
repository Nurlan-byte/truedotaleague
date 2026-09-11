import { createFileRoute } from "@tanstack/react-router";
import { buildStateCookie, getDiscordConfig } from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const config = getDiscordConfig(request);
        if (!config) {
          return Response.redirect(`${url.origin}/auth?discord_error=not_configured`, 302);
        }

        const random = crypto.getRandomValues(new Uint8Array(24));
        const state = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");

        const authorize = new URL("https://discord.com/api/oauth2/authorize");
        authorize.searchParams.set("client_id", config.clientId);
        authorize.searchParams.set("redirect_uri", config.redirectUri);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("scope", "identify email");
        authorize.searchParams.set("state", state);
        authorize.searchParams.set("prompt", "consent");

        return new Response(null, {
          status: 302,
          headers: {
            location: authorize.toString(),
            "set-cookie": buildStateCookie(state, 600, url.protocol === "https:"),
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
