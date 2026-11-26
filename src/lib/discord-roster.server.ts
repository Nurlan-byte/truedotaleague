import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { divisionOf } from "./divisions";
import { rosterPayload, writeRosterMessage, type RosterTeam } from "./discord-roster";

type Client = SupabaseClient<Database>;
export function rosterWebhook(title: string) {
  const division = divisionOf(title);
  const keys = [...(division ? [`DISCORD_WEBHOOK_${division.toUpperCase()}_URL`] : []), "DISCORD_WEBHOOK_AMATEUR_URL", "DISCORD_WEBHOOK_URL"];
  for (const key of keys) {
    const url = process.env[key];
    if (url) return { key, url };
  }
  throw new Error("Discord-канал турнира не настроен");
}

async function deleteMessage(url: string, id: string) {
  const response = await fetch(`${url.split("?")[0]}/messages/${id}`, { method: "DELETE", signal: AbortSignal.timeout(15000) });
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    console.error(`Discord deletion failed [${response.status}]: ${body}`);
    throw new Error(`Discord [${response.status}]: ${body}`);
  }
}

/** Caller authorizes first. Durable lease serializes rebuilds, including legacy-card cleanup. */
export async function syncTournamentRoster(sb: Client, tournamentId: string) {
  const token = crypto.randomUUID();
  let claimed = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const { data, error } = await sb.rpc("claim_discord_roster", { p_tournament_id: tournamentId, p_token: token });
    if (error) throw error;
    if (data) { claimed = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!claimed) throw new Error("Список команд обновляется; повторите попытку");
  try {
    const { data: saved, error: savedError } = await sb.from("discord_roster_messages").select("*").eq("tournament_id", tournamentId).single();
    if (savedError) throw savedError;
    const { data: tournament, error: tournamentError } = await sb.from("tournaments").select("title").eq("id", tournamentId).maybeSingle();
    if (tournamentError) throw tournamentError;
    if (!tournament) {
      if (saved.message_id) {
        const url = saved.webhook_key ? process.env[saved.webhook_key] : undefined;
        if (!url) throw new Error("Discord-канал удалённого турнира не настроен");
        await deleteMessage(url, saved.message_id);
      }
      const { error } = await sb.from("discord_roster_messages").delete().eq("tournament_id", tournamentId).eq("lock_token", token);
      if (error) throw error;
      return;
    }
    const webhook = rosterWebhook(tournament.title);
    const { data: applications, error: appError } = await sb.from("applications").select("team_id").eq("tournament_id", tournamentId).eq("status", "accepted").order("created_at");
    if (appError) throw appError;
    const ids = [...new Set((applications ?? []).map((a) => a.team_id))];
    const teams: RosterTeam[] = [];
    if (ids.length) {
      const { data: rows, error } = await sb.from("teams").select("id, name, owner_id").in("id", ids);
      if (error) throw error;
      const { data: members, error: memberError } = await sb.from("team_members").select("team_id, nickname, mmr, position, profile_id, profiles(nickname, competitive_rating, mmr)").in("team_id", ids).order("position");
      if (memberError) throw memberError;
      for (const id of ids) {
        const team = rows?.find((t) => t.id === id);
        if (!team) continue;
        teams.push({ id, name: team.name, players: (members ?? []).filter((m) => m.team_id === id).map((m) => ({
          name: m.profiles?.nickname || m.nickname || "Игрок", rating: m.profiles?.competitive_rating ?? m.mmr ?? m.profiles?.mmr ?? null,
          captain: m.profile_id === team.owner_id, position: m.position,
        })) });
      }
    }
    const { data: legacy, error: legacyError } = await sb.from("discord_posts").select("id, message_id").eq("tournament_id", tournamentId).order("created_at");
    if (legacyError) throw legacyError;
    const existingId = saved.message_id ?? legacy?.[0]?.message_id ?? null;
    const messageId = await writeRosterMessage(webhook.url, existingId, rosterPayload(tournament.title, tournamentId, teams));
    const { error: saveError } = await sb.from("discord_roster_messages").update({ message_id: messageId, webhook_key: webhook.key, team_ids: ids, updated_at: new Date().toISOString() }).eq("tournament_id", tournamentId).eq("lock_token", token);
    if (saveError) throw saveError;
    for (const post of legacy ?? []) {
      if (post.message_id !== messageId) await deleteMessage(webhook.url, post.message_id);
      const { error } = await sb.from("discord_posts").delete().eq("id", post.id);
      if (error) throw error;
    }
  } finally {
    const { error } = await sb.from("discord_roster_messages").update({ lock_token: null, locked_until: null }).eq("tournament_id", tournamentId).eq("lock_token", token);
    if (error) console.error("Discord roster lock release failed", error.code);
  }
}