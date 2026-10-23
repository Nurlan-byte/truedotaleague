import { createFileRoute } from "@tanstack/react-router";
import { buildReturnCookie, buildStateCookie, getDiscordConfig } from "@/lib/discord.server";
import { authRetryUrl, safeAuthReturn } from "@/lib/auth-return";

export const Route = createFileRoute("/api/public/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const next = safeAuthReturn(url.searchParams.get("next"));
        const config = getDiscordConfig(request);
        if (!config) {
          return Response.redirect(`${url.origin}${authRetryUrl(next, "not_configured")}`, 302);
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

        const headers = new Headers({ location: authorize.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" });
        headers.append("set-cookie", buildStateCookie(state, 600, url.protocol === "https:"));
        headers.append("set-cookie", buildReturnCookie(next, state, 600, url.protocol === "https:"));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
