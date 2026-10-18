export type Player = {
  id: string;
  name: string;
  nick?: string | undefined;
  rating?: number | undefined;
};
export type Captain = {
  id: string;
  name: string;
  nick?: string | undefined;
  team: string;
  color: string;
};
export type HistoryEntry = {
  kind: "pick" | "skip";
  turn: number;
  round: number;
  pickNo: number;
  captainId: string;
  playerId?: string | undefined;
  at: number;
};
export type Phase = "setup" | "live" | "done";
export type DraftState = {
  title: string;
  players: Player[];
  captains: Captain[]; // order = draft order
  teamSize: number; // total incl. captain if captainCounts
  captainCounts: boolean;
  snake: boolean;
  phase: Phase;
  paused: boolean;
  turn: number;
  history: HistoryEntry[];
  archive: { title: string; at: number; text: string }[];
};

export const ORG = "TrueDotaLeague";
export const MAX_DRAFT_CAPTAINS = 32;
export const MAX_DRAFT_PICKS_PER_TEAM = 16;

export const TEAM_COLORS = [
  "#3ec5ff",
  "#ff7a1a",
  "#c6f432",
  "#ff4d8d",
  "#ffd23f",
  "#9b8cff",
  "#2ee6a6",
  "#ff5a4e",
];

export const uid = () => Math.random().toString(36).slice(2, 10);

export const initialState = (): DraftState => ({
  title: "Immortal Draft",
  players: [],
  captains: [],
  teamSize: 5,
  captainCounts: true,
  snake: true,
  phase: "setup",
  paused: false,
  turn: 0,
  history: [],
  archive: [],
});

/** Captain index (in order) for a given turn number (0-based). */
export function captainIndexForTurn(turn: number, count: number, snake: boolean): number {
  if (count <= 0) return -1;
  const round = Math.floor(turn / count);
  const pos = turn % count;
  return snake && round % 2 === 1 ? count - 1 - pos : pos;
}

export const slotsPerTeam = (s: Pick<DraftState, "teamSize" | "captainCounts">) =>
  Math.max(0, s.teamSize - (s.captainCounts ? 1 : 0));

export function rosterOf(s: DraftState, captainId: string): Player[] {
  return s.history
    .filter((h) => h.kind === "pick" && h.captainId === captainId)
    .map((h) => s.players.find((p) => p.id === h.playerId)!)
    .filter(Boolean);
}

export function availablePlayers(s: DraftState): Player[] {
  const taken = new Set(s.history.filter((h) => h.kind === "pick").map((h) => h.playerId));
  return s.players.filter((p) => !taken.has(p.id));
}

/** Next turn >= s.turn whose team still has open slots; null if draft is complete. */
export function currentTurn(
  s: DraftState,
): { turn: number; captain: Captain; round: number } | null {
  const n = s.captains.length;
  const slots = slotsPerTeam(s);
  if (!n || availablePlayers(s).length === 0) return null;
  const counts = new Map(s.captains.map((c) => [c.id, rosterOf(s, c.id).length]));
  if ([...counts.values()].every((v) => v >= slots)) return null;
  for (let t = s.turn; t < s.turn + n * (slots + 2) + n; t++) {
    const c = s.captains[captainIndexForTurn(t, n, s.snake)];
    if (c && (counts.get(c.id) ?? 0) < slots)
      return { turn: t, captain: c, round: Math.floor(t / n) + 1 };
  }
  return null;
}

export function pick(s: DraftState, playerId: string): DraftState {
  const cur = currentTurn(s);
  if (!cur || s.phase !== "live" || s.paused) return s;
  if (!availablePlayers(s).some((p) => p.id === playerId)) return s; // no double picks
  const pickNo = s.history.filter((h) => h.kind === "pick").length + 1;
  const entry: HistoryEntry = {
    kind: "pick",
    turn: s.turn,
    round: cur.round,
    pickNo,
    captainId: cur.captain.id,
    playerId,
    at: Date.now(),
  };
  return { ...s, turn: cur.turn + 1, history: [...s.history, entry] };
}

export function skip(s: DraftState): DraftState {
  const cur = currentTurn(s);
  if (!cur || s.phase !== "live" || s.paused) return s;
  const entry: HistoryEntry = {
    kind: "skip",
    turn: s.turn,
    round: cur.round,
    pickNo: 0,
    captainId: cur.captain.id,
    at: Date.now(),
  };
  return { ...s, turn: cur.turn + 1, history: [...s.history, entry] };
}

export function undo(s: DraftState): DraftState {
  const last = s.history[s.history.length - 1];
  if (!last) return s;
  return {
    ...s,
    turn: last.turn,
    history: s.history.slice(0, -1),
    phase: s.phase === "done" ? "live" : s.phase,
  };
}

export function validate(s: DraftState): string[] {
  const e: string[] = [];
  if (s.captains.length < 2) e.push("Нужно минимум 2 капитана");
  if (s.captains.length > MAX_DRAFT_CAPTAINS) e.push("Не более 32 капитанов");
  if (s.players.length === 0) e.push("Добавьте игроков");
  if (slotsPerTeam(s) < 1) e.push("Размер команды слишком мал");
  if (slotsPerTeam(s) > MAX_DRAFT_PICKS_PER_TEAM) e.push("Не более 16 пиков на команду");
  return e;
}

export function resultsText(s: DraftState): string {
  const lines = [ORG, s.title, ""];
  s.captains.forEach((c) => {
    lines.push(`${c.team} — капитан ${c.name}${c.nick ? ` (${c.nick})` : ""}`);
    rosterOf(s, c.id).forEach((p, i) =>
      lines.push(
        `  ${i + 1}. ${p.name}${p.nick ? ` (${p.nick})` : ""}${p.rating != null ? ` [${p.rating}]` : ""}`,
      ),
    );
    lines.push("");
  });
  return lines.join("\n").trim();
}

export function resultsCsv(s: DraftState): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Команда", "Капитан", "Пик №", "Раунд", "Игрок", "Никнейм", "Рейтинг"]];
  s.history
    .filter((h) => h.kind === "pick")
    .forEach((h) => {
      const c = s.captains.find((x) => x.id === h.captainId)!;
      const p = s.players.find((x) => x.id === h.playerId)!;
      rows.push([
        c.team,
        c.name,
        String(h.pickNo),
        String(h.round),
        p.name,
        p.nick ?? "",
        p.rating?.toString() ?? "",
      ]);
    });
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function parseBulk(text: string): Player[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[;,\t]/).map((x) => x.trim());
      const rating = parts[2] ? Number(parts[2]) : undefined;
      return {
        id: uid(),
        name: parts[0] ?? "",
        nick: parts[1] || undefined,
        rating: Number.isFinite(rating) ? rating : undefined,
      };
    });
}
