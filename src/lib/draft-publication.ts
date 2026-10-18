import { type DraftState, rosterOf } from "@/lib/draft";

export type PublishedDraft = {
  title: string;
  captainPlays: boolean;
  teams: {
    name: string;
    captain: string;
    captainNick?: string;
    players: { name: string; nick?: string; rating?: number }[];
  }[];
};

export function publishedDraftFromState(state: DraftState): PublishedDraft {
  return {
    title: state.title.trim().slice(0, 160),
    captainPlays: state.captainCounts,
    teams: state.captains.map((captain) => ({
      name: captain.team.trim().slice(0, 160),
      captain: captain.name.trim().slice(0, 160),
      ...(captain.nick ? { captainNick: captain.nick.trim().slice(0, 160) } : {}),
      players: rosterOf(state, captain.id).map((player) => ({
        name: player.name.trim().slice(0, 160),
        ...(player.nick ? { nick: player.nick.trim().slice(0, 160) } : {}),
        ...(player.rating != null ? { rating: player.rating } : {}),
      })),
    })),
  };
}

export function isPublishedDraft(value: unknown): value is PublishedDraft {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.title === "string" &&
    typeof result.captainPlays === "boolean" &&
    Array.isArray(result.teams) &&
    result.teams.every(
      (team: unknown) =>
        !!team &&
        typeof team === "object" &&
        typeof (team as Record<string, unknown>).name === "string" &&
        typeof (team as Record<string, unknown>).captain === "string" &&
        ((team as Record<string, unknown>).captainNick === undefined ||
          typeof (team as Record<string, unknown>).captainNick === "string") &&
        Array.isArray((team as Record<string, unknown>).players) &&
        ((team as Record<string, unknown>).players as unknown[]).every(
          (player) =>
            !!player &&
            typeof player === "object" &&
            typeof (player as Record<string, unknown>).name === "string",
        ),
    )
  );
}
