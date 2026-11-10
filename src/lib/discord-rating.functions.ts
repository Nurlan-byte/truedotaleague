import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Re-reads the caller's Discord server roles (Competitive Rating + titles) and stores them.
// Only the signed-in user's own profile is touched; the data comes from Discord, not the client.
export const refreshMyRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchDiscordGuildProfile } = await import("@/lib/discord.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error } = await supabaseAdmin
      .from("profiles")
      .select("discord_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prof?.discord_id) return { status: "no_discord" as const, rating: null, titles: [] as string[] };
    const guildProfile = await fetchDiscordGuildProfile(prof.discord_id);
    if (guildProfile === undefined)
      return { status: "discord_unavailable" as const, rating: null, titles: [] as string[] };
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ competitive_rating: guildProfile.rating, titles: guildProfile.titles })
      .eq("id", context.userId);
    if (upErr) throw new Error(upErr.message);
    return {
      status: guildProfile.rating === null ? ("no_role" as const) : ("ok" as const),
      rating: guildProfile.rating,
      titles: guildProfile.titles,
    };
  });
