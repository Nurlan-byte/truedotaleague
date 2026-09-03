export type Team = {
  id: string;
  name: string;
  logo?: string;
  registeredAt?: string;
  /** id пользователя, зарегистрировавшего команду (капитан). */
  ownerId?: string;
  ownerName?: string;
};

/** TDL-очки за место в турнире. */
export const PLACE_POINTS: Record<number, number> = { 1: 50, 2: 25, 3: 12, 4: 6 };

export type Placement = { place: number; teamName: string; logo?: string; points: number };

export type TournamentRecord = {
  id: string;
  title: string;
  date: string;
  placements: Placement[];
};

export type Match = {
  id: string;
  round: number;
  order: number;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Дата и время матча в формате datetime-local ("2026-09-03T18:00"). */
  scheduledAt?: string | null;
};

export type GroupMatch = {
  id: string;
  group: number;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  scheduledAt?: string | null;
};

/** Читаемая дата матча, например «3 сент, 18:00». */
export function formatMatchTime(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}


export const uid = () => Math.random().toString(36).slice(2, 10);

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Single elimination bracket. Teams padded with byes to the next power of two. */
export function buildBracket(teams: Team[]): Match[] {
  const n = teams.length;
  if (n < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(n));
  const half = size / 2;
  // Spread byes: first `half` teams take slot A of each match, the rest fill slot B.
  const slots: (string | null)[] = Array(size).fill(null);
  teams.forEach((t, i) => {
    slots[i < half ? i * 2 : (i - half) * 2 + 1] = t.id;
  });


  const matches: Match[] = [];
  let round = 1;
  let count = size / 2;
  for (let i = 0; i < count; i++) {
    matches.push({
      id: uid(),
      round,
      order: i,
      teamA: slots[i * 2],
      teamB: slots[i * 2 + 1],
      scoreA: null,
      scoreB: null,
    });
  }
  while (count > 1) {
    round++;
    count = count / 2;
    for (let i = 0; i < count; i++) {
      matches.push({
        id: uid(),
        round,
        order: i,
        teamA: null,
        teamB: null,
        scoreA: null,
        scoreB: null,
      });
    }
  }
  return propagate(matches);
}

export function matchWinner(m: Match): string | null {
  if (m.teamA && !m.teamB) return m.teamA;
  if (m.teamB && !m.teamA) return m.teamB;
  if (m.scoreA === null || m.scoreB === null || m.scoreA === m.scoreB) return null;
  return m.scoreA > m.scoreB ? m.teamA : m.teamB;
}

/** Recompute every downstream slot from the current results. */
export function propagate(matches: Match[]): Match[] {
  const out = matches.map((m) => ({ ...m }));
  const rounds = Math.max(...out.map((m) => m.round));
  for (let r = 1; r < rounds; r++) {
    const current = out.filter((m) => m.round === r).sort((a, b) => a.order - b.order);
    const next = out.filter((m) => m.round === r + 1).sort((a, b) => a.order - b.order);
    next.forEach((m, i) => {
      const left = matchWinner(current[i * 2]);
      const right = matchWinner(current[i * 2 + 1]);
      if (m.teamA !== left || m.teamB !== right) {
        m.scoreA = null;
        m.scoreB = null;
      }
      m.teamA = left;
      m.teamB = right;
    });
  }
  return out;
}

export function roundName(round: number, totalRounds: number): string {
  const left = totalRounds - round;
  if (left === 0) return "Финал";
  if (left === 1) return "1/2 финала";
  if (left === 2) return "1/4 финала";
  return `1/${2 ** (left + 1)} финала`;
}

/** Round-robin group stage. */
export function buildGroups(teams: Team[], groupCount: number) {
  const shuffled = shuffle(teams);
  const groups: Team[][] = Array.from({ length: groupCount }, () => []);
  shuffled.forEach((t, i) => groups[i % groupCount].push(t));

  const matches: GroupMatch[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        matches.push({
          id: uid(),
          group: gi,
          teamA: g[i].id,
          teamB: g[j].id,
          scoreA: null,
          scoreB: null,
        });
      }
    }
  });
  return { groups, matches };
}

export type Standing = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  points: number;
};

export function standings(group: Team[], matches: GroupMatch[]): Standing[] {
  const table = new Map<string, Standing>(
    group.map((t) => [
      t.id,
      {
        teamId: t.id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        scored: 0,
        conceded: 0,
        points: 0,
      },
    ]),
  );

  for (const m of matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    const a = table.get(m.teamA);
    const b = table.get(m.teamB);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.scored += m.scoreA;
    a.conceded += m.scoreB;
    b.scored += m.scoreB;
    b.conceded += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.wins++;
      b.losses++;
      a.points += 3;
    } else if (m.scoreA < m.scoreB) {
      b.wins++;
      a.losses++;
      b.points += 3;
    } else {
      a.draws++;
      b.draws++;
      a.points++;
      b.points++;
    }
  }

  return [...table.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.scored - y.conceded - (x.scored - x.conceded) ||
      y.scored - x.scored,
  );
}

/** Итоговые места 1-4 по сетке плей-офф. */
export function finalPlacements(matches: Match[], teams: Team[]): Placement[] {
  if (matches.length === 0) return [];
  const totalRounds = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === totalRounds);
  if (!final) return [];
  const champ = matchWinner(final);
  if (!champ) return [];
  const runnerUp = final.teamA === champ ? final.teamB : final.teamA;

  const semis = matches.filter((m) => m.round === totalRounds - 1);
  const semiLosers = semis
    .map((m) => {
      const w = matchWinner(m);
      if (!w) return null;
      const loser = m.teamA === w ? m.teamB : m.teamA;
      if (!loser) return null;
      const diff =
        (m.teamA === loser ? (m.scoreA ?? 0) - (m.scoreB ?? 0) : (m.scoreB ?? 0) - (m.scoreA ?? 0));
      return { id: loser, diff };
    })
    .filter((x): x is { id: string; diff: number } => !!x)
    .sort((a, b) => b.diff - a.diff)
    .map((x) => x.id);

  const ordered = [champ, runnerUp, ...semiLosers].filter(
    (id): id is string => !!id,
  );

  return ordered.map((id, i) => {
    const team = teams.find((t) => t.id === id);
    return {
      place: i + 1,
      teamName: team?.name ?? "—",
      logo: team?.logo,
      points: PLACE_POINTS[i + 1] ?? 0,
    };
  });
}

/** Места по групповому этапу — резерв, если плей-офф не проводился/не доигран. */
export function groupPlacements(
  groups: Team[][],
  groupMatches: GroupMatch[],
): Placement[] {
  const rows = groups.flatMap((g, gi) =>
    standings(
      g,
      groupMatches.filter((m) => m.group === gi),
    ).map((row) => ({ row, team: g.find((t) => t.id === row.teamId) })),
  );
  const played = rows.filter((r) => r.row.played > 0 && r.team);
  if (played.length < 2) return [];
  return played
    .sort(
      (x, y) =>
        y.row.points - x.row.points ||
        y.row.scored - y.row.conceded - (x.row.scored - x.row.conceded) ||
        y.row.scored - x.row.scored,
    )
    .map((r, i) => ({
      place: i + 1,
      teamName: r.team!.name,
      logo: r.team!.logo,
      points: PLACE_POINTS[i + 1] ?? 0,
    }));
}


export type RankRow = { teamName: string; logo?: string; points: number; titles: number; events: number };

/** Общий рейтинг команд по всем сохранённым турнирам. */
export function leaderboard(history: TournamentRecord[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const t of history) {
    for (const p of t.placements) {
      const row = map.get(p.teamName) ?? {
        teamName: p.teamName,
        logo: p.logo,
        points: 0,
        titles: 0,
        events: 0,
      };
      row.points += p.points;
      row.events += 1;
      if (p.place === 1) row.titles += 1;
      if (!row.logo && p.logo) row.logo = p.logo;
      map.set(p.teamName, row);
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.titles - a.titles);
}
