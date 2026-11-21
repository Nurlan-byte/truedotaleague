import roundRobin from "roundrobin";
export const FREEDOM_KEY = "tdl-freedom-season-2";
export const FREEDOM_TITLE = "TDL FREEDOM LEAGUE #2";
export const FREEDOM = {
  limit: 16,
  fee: 50000,
  installment: 12500,
  installments: 4,
  start: "2026-12-04",
  end: "2026-12-27",
  initialPrize: 100000,
  maxPrize: 700000,
  prizes: [400000, 200000, 100000],
  tiers: [
    { teams: 8, prize: 350000 },
    { teams: 12, prize: 525000 },
    { teams: 16, prize: 700000 },
  ],
} as const;
export const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
export function isBo2(a: number | null, b: number | null) {
  return (
    a !== null &&
    b !== null &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0 &&
    a <= 2 &&
    b <= 2 &&
    a + b === 2
  );
}
export function matchPoints(a: number, b: number) {
  return a > b ? 3 : a === b ? 1 : 0;
}
export type FreedomMatch = {
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
};
export function freedomTable(
  teams: { team_id: string; team_name: string; logo_url: string | null }[],
  matches: FreedomMatch[],
) {
  const rows = teams.map((t) => ({
    ...t,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    mapsFor: 0,
    mapsAgainst: 0,
    points: 0,
    form: [] as string[],
  }));
  const byId = new Map(rows.map((r) => [r.team_id, r]));
  for (const m of matches) {
    const a = m.score_a,
      b = m.score_b;
    if (a === null || b === null || !isBo2(a, b)) continue;
    const left = m.team_a_id ? byId.get(m.team_a_id) : undefined;
    const right = m.team_b_id ? byId.get(m.team_b_id) : undefined;
    if (!left || !right || left === right) continue;
    for (const [row, own, other] of [
      [left, a, b],
      [right, b, a],
    ] as const) {
      row.played++;
      row.mapsFor += own;
      row.mapsAgainst += other;
      row.points += matchPoints(own, other);
      if (own > other) row.won++;
      else if (own === other) row.drawn++;
      else row.lost++;
      row.form.push(own > other ? "В" : own === other ? "Н" : "П");
    }
  }
  // Equal points remain shared ranks until the organizer supplies tie-break rules.
  rows.sort((a, b) => b.points - a.points || a.team_name.localeCompare(b.team_name, "ru"));
  return rows.map((r, i) => ({
    ...r,
    rank: rows.findIndex((x) => x.points === r.points) + 1,
    order: i + 1,
  }));
}
export function freedomCalendar(ids: string[]) {
  if (ids.length < 2 || ids.length > FREEDOM.limit || new Set(ids).size !== ids.length)
    throw new Error("Требуется от 2 до 16 разных команд");
  const days = [5, 6, 12, 13, 19, 20, 26, 27];
  return roundRobin(ids.length, [...ids]).flatMap((pairs, index) => {
    const day = days[Math.floor(index / 2)];
    if (!day) throw new Error("Нет даты для тура");
    const scheduled_at = `2026-12-${String(day).padStart(2, "0")}T${index % 2 === 0 ? "07" : "09"}:00:00Z`;
    return pairs.map(([a, b]) => ({ round: index + 1, team_a_id: a, team_b_id: b, scheduled_at }));
  });
}
export function validFreedomTime(iso: string) {
  const date = new Date(new Date(iso).getTime() + 5 * 3600000);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.toISOString().slice(0, 10);
  return (
    day >= FREEDOM.start &&
    day <= FREEDOM.end &&
    [0, 6].includes(date.getUTCDay()) &&
    date.getUTCHours() >= 12 &&
    date.getUTCHours() < 16
  );
}
