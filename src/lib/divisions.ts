export type Division = "amateur" | "challenger" | "freedom";

export const DIVISIONS: { id: Division; name: string; tagline: string; teamMmr: number | null; points: string[] }[] = [
  {
    id: "amateur",
    name: "TDL Amateur",
    tagline: "Для начинающих и любителей",
    teamMmr: 16500,
    points: ["До 16 500 MMR на команду", "Максимум 4 500 MMR на игрока", "Контроль смурфов", "Соревновательные матчи"],
  },
  {
    id: "challenger",
    name: "TDL Challenger",
    tagline: "Для опытных игроков",
    teamMmr: 26500,
    points: ["До 26 500 MMR на команду", "Более высокий уровень конкуренции", "Командные соревнования", "Рейтинговые очки"],
  },
  {
    id: "freedom",
    name: "TDL Freedom",
    tagline: "Открытый дивизион",
    teamMmr: null,
    points: ["Без ограничений MMR", "Сильнейшие команды", "Высокая конкуренция", "Открытые турниры"],
  },
];

/** Дивизион турнира определяется по названию (отдельного поля в базе нет). */
export function divisionOf(title: string): Division | null {
  const t = title.toLowerCase();
  if (t.includes("amateur") || t.includes("амат")) return "amateur";
  if (t.includes("challenger") || t.includes("челленд")) return "challenger";
  if (t.includes("freedom") || t.includes("фридом")) return "freedom";
  return null;
}

export function mmrLimitText(division: Division | null): string | null {
  if (!division) return null;
  const d = DIVISIONS.find((x) => x.id === division)!;
  return d.teamMmr ? `до ${d.teamMmr.toLocaleString("ru-RU")} MMR на команду` : "Без ограничений MMR";
}

export function isDivision(v: unknown): v is Division {
  return v === "amateur" || v === "challenger" || v === "freedom";
}

type M = { team_a_id: string | null; team_b_id: string | null; score_a: number | null; score_b: number | null };

/** Победы/поражения по сыгранным матчам (ничьи и матчи без счёта не считаются). */
export function winLoss(matches: M[]): Map<string, { wins: number; losses: number }> {
  const out = new Map<string, { wins: number; losses: number }>();
  const get = (id: string) => out.get(id) ?? (out.set(id, { wins: 0, losses: 0 }), out.get(id)!);
  for (const m of matches) {
    if (!m.team_a_id || !m.team_b_id || m.score_a == null || m.score_b == null || m.score_a === m.score_b) continue;
    const [w, l] = m.score_a > m.score_b ? [m.team_a_id, m.team_b_id] : [m.team_b_id, m.team_a_id];
    get(w).wins++;
    get(l).losses++;
  }
  return out;
}

export function isPlayed(m: M): boolean {
  return !!m.team_a_id && !!m.team_b_id && m.score_a != null && m.score_b != null;
}
