import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { divisionOf } from "@/lib/divisions";

// У каждого дивизиона свой Discord-канал; без отдельного вебхука — канал Amateur.
function webhookFor(title: string | null | undefined): string | undefined {
  const div = title ? divisionOf(title) : null;
  const specific = div ? process.env[`DISCORD_WEBHOOK_${div.toUpperCase()}_URL`] : undefined;
  return specific || process.env["DISCORD_WEBHOOK_AMATEUR_URL"] || process.env["DISCORD_WEBHOOK_URL"];
}
async function titleOf(sb: any, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await sb.from("tournaments").select("title").eq("id", id).maybeSingle();
  return data?.title ?? null;
}

const input = z.object({
  kind: z.enum(["team_created", "application_submitted", "application_accepted"]),
  teamId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  tournamentId: z.string().uuid().optional(),
});

// Только принятие заявки меняет публичный список; отправка заявки не публикует команду.
export const notifyDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    if (data.kind !== "application_accepted" || !data.applicationId) return { ok: false };
    const { data: application, error } = await context.supabase.from("applications")
      .select("team_id, tournament_id, status").eq("id", data.applicationId).maybeSingle();
    if (error) throw error;
    if (!application || application.status !== "accepted") return { ok: false };
    const { data: staff, error: staffError } = await context.supabase.rpc("is_staff_for", { _tournament_id: application.tournament_id, _uid: context.userId });
    if (staffError) throw staffError;
    if (!staff) throw new Error("forbidden");
    const { data: members, error: memberError } = await context.supabase.from("team_members").select("profile_id").eq("team_id", application.team_id);
    if (memberError) throw memberError;
    const { syncGuildProfiles } = await import("@/lib/discord.server");
    await syncGuildProfiles((members ?? []).map((m) => m.profile_id).filter((id): id is string => !!id));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncTournamentRoster } = await import("@/lib/discord-roster.server");
    await syncTournamentRoster(supabaseAdmin, application.tournament_id);
    return { ok: true };
  });

const removeInput = z.object({ teamId: z.string().uuid().optional(), applicationId: z.string().uuid().optional(), tournamentId: z.string().uuid().optional() });

// Убирает из Discord карточки состава, которые больше не актуальны:
// команда удалена — убираются все; заявка снята/отклонена — карточка этого турнира.
// Решение принимается по состоянию базы, поэтому вызов безопасен для любого пользователя.
export const removeDiscordPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => removeInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.tournamentId) {
      const { data: admin, error } = await context.supabase.rpc("is_admin", { _uid: context.userId });
      if (error || !admin) throw new Error("forbidden");
      const { data: tournament, error: readError } = await context.supabase.from("tournaments").select("id").eq("id", data.tournamentId).maybeSingle();
      if (readError) throw readError;
      if (tournament) return { removed: 0, failed: false };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { syncTournamentRoster } = await import("@/lib/discord-roster.server");
      await syncTournamentRoster(supabaseAdmin, data.tournamentId);
      const { data: posts, error: postsError } = await supabaseAdmin.from("discord_posts").select("id, message_id").eq("tournament_id", data.tournamentId);
      if (postsError) throw postsError;
      // Турнир уже удалён — название недоступно; пробуем все каналы.
      const url = process.env["DISCORD_WEBHOOK_AMATEUR_URL"] || process.env["DISCORD_WEBHOOK_URL"];
      const urls = [...new Set([url, ...["RISING", "CHALLENGER", "FREEDOM"].map((d) => process.env[`DISCORD_WEBHOOK_${d}_URL`])].filter((u): u is string => !!u))];
      if (!posts?.length) return { removed: 0, failed: false };
      if (!urls.length) return { removed: 0, failed: true };
      let removed = 0;
      for (const post of posts) {
        try {
          let done = false;
          for (const u of urls) {
            const response = await fetch(`${u.split("?")[0]}/messages/${post.message_id}`, { method: "DELETE", signal: AbortSignal.timeout(10000) });
            if (response.ok) { done = true; break; }
          }
          if (done) {
            const { error: deleteError } = await supabaseAdmin.from("discord_posts").delete().eq("id", post.id);
            if (!deleteError) removed++;
          }
        } catch { /* Preserve failed records for a later cleanup retry. */ }
      }
      return { removed, failed: removed !== posts.length };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let teamId = data.teamId;
    if (!teamId && data.applicationId) {
      const { data: app } = await supabaseAdmin.from("applications").select("team_id").eq("id", data.applicationId).maybeSingle();
      teamId = app?.team_id ?? undefined;
    }
    if (!teamId) return { removed: 0 };
    const { data: posts } = await supabaseAdmin
      .from("discord_posts")
      .select("id, tournament_id, message_id")
      .eq("team_id", teamId);
    const { syncTournamentRoster } = await import("@/lib/discord-roster.server");
    const { data: summaries, error: summaryError } = await supabaseAdmin.from("discord_roster_messages").select("tournament_id").contains("team_ids", [teamId]);
    if (summaryError) throw summaryError;
    // Пересобираем общий список по принятым заявкам — не удаляем сообщение остальных команд.
    for (const summary of summaries ?? []) await syncTournamentRoster(supabaseAdmin, summary.tournament_id);
    if (!posts?.length) return { removed: 0 };
    const { data: team } = await supabaseAdmin.from("teams").select("id").eq("id", teamId).maybeSingle();
    const { data: apps } = await supabaseAdmin
      .from("applications")
      .select("tournament_id, status")
      .eq("team_id", teamId)
      .in("status", ["pending", "accepted"]);
    const active = new Set((apps ?? []).map((a) => a.tournament_id));
    const stale = posts.filter((p) => !team || (p.tournament_id && !active.has(p.tournament_id)));
    let removed = 0;
    for (const p of stale) {
      const url = webhookFor(await titleOf(supabaseAdmin, p.tournament_id));
      if (!url) continue;
      const r = await fetch(`${url.split("?")[0]}/messages/${p.message_id}`, { method: "DELETE" });
      if (r.ok || r.status === 404) {
        await supabaseAdmin.from("discord_posts").delete().eq("id", p.id);
        removed++;
      }
    }
    return { removed };
  });
