import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://truedotaleague.lovable.app";

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
    // Новые команды — в канал TDL Amateur, заявки на турниры — в основной канал.
    const url =
      (data.kind === "team_created" ? process.env["DISCORD_WEBHOOK_AMATEUR_URL"] : undefined) ||
      process.env["DISCORD_WEBHOOK_URL"];
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
    const { data: members } = await supabase
      .from("team_members")
      .select("nickname, role")
      .eq("team_id", team.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", userId)
      .maybeSingle();

    const teamLabel = `${team.name}${team.tag ? ` [${team.tag}]` : ""}`;
    const roster = (members ?? []).map((m) => `• ${m.nickname}${m.role ? ` — ${m.role}` : ""}`).join("\n");
    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: "Капитан", value: profile?.nickname || "—", inline: true },
    ];
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
      title = `📝 Заявка на турнир: ${teamLabel}`;
      fields.push({ name: "Турнир", value: t?.title ?? "—", inline: true });
      link = `${SITE}/tournaments/${data.tournamentId}`;
    }
    if (roster) fields.push({ name: "Состав", value: roster.slice(0, 1000) });

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "TrueDotaLeague",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: title.slice(0, 250),
            url: link,
            color: 0x2563eb,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "TrueDotaLeague" },
          },
        ],
      }),
    });
    return { ok: res.ok };
  });
