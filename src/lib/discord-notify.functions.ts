import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://truedotaleague.kz";

const input = z.object({
  kind: z.enum(["team_created", "application_submitted"]),
  teamId: z.string().uuid(),
  tournamentId: z.string().uuid().optional(),
});

// Отправляет уведомление в Discord-канал лиги. Данные берутся из базы, не от клиента.
export const notifyDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    // Команды и заявки публикуются в канал TDL Amateur.
    const url = process.env["DISCORD_WEBHOOK_AMATEUR_URL"] || process.env["DISCORD_WEBHOOK_URL"];
    if (!url) return { ok: false };
    const { supabase, userId } = context;

    const { data: team } = await supabase
      .from("teams")
      .select("id, name, tag, owner_id, logo_url")
      .eq("id", data.teamId)
      .maybeSingle();
    if (!team || team.owner_id !== userId) {
      const { data: cap } = await supabase
        .from("team_captains")
        .select("user_id")
        .eq("team_id", data.teamId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!team || !cap) return { ok: false };
    }
    // Свежий рейтинг из Discord перед публикацией состава.
    {
      const { data: ids } = await supabase.from("team_members").select("profile_id").eq("team_id", team.id);
      const { syncGuildProfiles } = await import("@/lib/discord.server");
      await syncGuildProfiles((ids ?? []).map((m) => m.profile_id).filter((x): x is string => !!x));
    }
    const { data: members } = await supabase
      .from("team_members")
      .select("nickname, role, mmr, position, profile_id, profiles(nickname, competitive_rating, mmr)")
      .eq("team_id", team.id)
      .order("position");
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", userId)
      .maybeSingle();

    const teamLabel = `${team.name}${team.tag ? ` [${team.tag}]` : ""}`;
    const players = (members ?? []).map((m) => {
      const p = m.profiles as { nickname: string | null; competitive_rating: number | null; mmr: number | null } | null;
      const name = p?.nickname || m.nickname || "Игрок";
      const rating = p?.competitive_rating ?? m.mmr ?? p?.mmr ?? null;
      return { name, rating, role: m.role, captain: !!m.profile_id && m.profile_id === team.owner_id };
    });
    // Общий MMR — по основной пятёрке, как в списке команд лиги.
    const total = players.slice(0, 5).reduce((s, p) => s + (p.rating ?? 0), 0);
    const roster = players
      .map((p, i) => `${p.name} \`${p.rating ?? "—"}\`${p.captain ? " ⭐" : ""}${i >= 5 ? " (замена)" : ""}`)
      .join("\n");
    const block = `🏅 ***${team.name}*** \`${total} ммр\`\n${roster}`;
    void profile;
    const fields: { name: string; value: string; inline?: boolean }[] = [];
    let title = `🛡️ Новая команда: ${teamLabel}`;
    let link = `${SITE}/teams`;

    if (data.kind === "application_submitted") {
      if (!data.tournamentId) return { ok: false };
      const { data: app } = await supabase
        .from("applications")
        .select("id")
        .eq("team_id", team.id)
        .eq("tournament_id", data.tournamentId)
        .eq("status", "pending")
        .maybeSingle();
      if (!app) return { ok: false };
      const { data: t } = await supabase
        .from("tournaments")
        .select("title")
        .eq("id", data.tournamentId)
        .maybeSingle();
      title = `${t?.title ?? "Турнир"} — новая команда ✅`;
      link = `${SITE}/tournaments/${data.tournamentId}`;
    }
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "TDL Amateur League",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: title.slice(0, 250),
            url: link,
            color: 0x3b82f6,
            description: block.slice(0, 3500),
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "TrueDotaLeague" },
          },
        ],
      }),
    });
    if (res.ok) {
      const msg = (await res.json().catch(() => null)) as { id?: string } | null;
      if (msg?.id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("discord_posts").insert({
          team_id: team.id,
          tournament_id: data.kind === "application_submitted" ? data.tournamentId! : null,
          message_id: msg.id,
        });
      }
    }
    return { ok: res.ok };
  });

const removeInput = z.object({ teamId: z.string().uuid().optional(), applicationId: z.string().uuid().optional() });

// Убирает из Discord карточки состава, которые больше не актуальны:
// команда удалена — убираются все; заявка снята/отклонена — карточка этого турнира.
// Решение принимается по состоянию базы, поэтому вызов безопасен для любого пользователя.
export const removeDiscordPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => removeInput.parse(d))
  .handler(async ({ data }) => {
    const url = process.env["DISCORD_WEBHOOK_AMATEUR_URL"] || process.env["DISCORD_WEBHOOK_URL"];
    if (!url) return { removed: 0 };
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
    if (!posts?.length) return { removed: 0 };
    const { data: team } = await supabaseAdmin.from("teams").select("id").eq("id", teamId).maybeSingle();
    const { data: apps } = await supabaseAdmin
      .from("applications")
      .select("tournament_id, status")
      .eq("team_id", teamId)
      .in("status", ["pending", "accepted"]);
    const active = new Set((apps ?? []).map((a) => a.tournament_id));
    const stale = posts.filter((p) => !team || (p.tournament_id && !active.has(p.tournament_id)));
    const base = url.split("?")[0];
    let removed = 0;
    for (const p of stale) {
      const r = await fetch(`${base}/messages/${p.message_id}`, { method: "DELETE" });
      if (r.ok || r.status === 404) {
        await supabaseAdmin.from("discord_posts").delete().eq("id", p.id);
        removed++;
      }
    }
    return { removed };
  });
