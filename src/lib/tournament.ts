export type Team = {
  id: string;
  name: string;
  logo?: string;
  registeredAt?: string;
  /** id пользователя, зарегистрировавшего команду (капитан). */
  ownerId?: string;
  ownerName?: string;
  /** id команды из раздела «Моя команда», если заявка подана оттуда. */
  rosterId?: string;
};

/** Игрок состава команды. */
export type RosterPlayer = {
  id: string;
  nickname: string;
  role?: string;
  mmr?: number | null;
};

/** Команда, созданная капитаном: постоянный состав, независимо от турниров. */
export type RosterTeam = {
  id: string;
  name: string;
  tag?: string;
  logo?: string;
  ownerId: string;
  ownerName?: string;
  createdAt: string;
  players: RosterPlayer[];
};

/** Заявка команды на участие в турнире — ждёт решения администратора. */
export type Application = {
  id: string;
  rosterId: string;
  teamName: string;
  tag?: string;
  logo?: string;
  ownerId: string;
  ownerName?: string;
  playersCount: number;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  /** Причина отказа, если заявка отклонена. */
  note?: string;
};


/** TDL-очки за место в турнире. */
export const PLACE_POINTS: Record<number, number> = { 1: 50, 2: 25, 3: 12, 4: 6 };

export type Placement = { place: number; teamName: string; logo?: string; points: number };

export type TournamentRecord = {
  id: string;
  title: string;
  date: string;
  placements: Placement[];
  /** Снимок турнира на момент завершения — для просмотра сетки в архиве. */
  teams?: Team[];
  bracket?: Match[];
  groups?: Team[][];
  groupMatches?: GroupMatch[];
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
  /** Часть сетки: верхняя, нижняя или гранд-финал (Double Elimination). */
  bracket?: Bracket;
};

export type Bracket = "upper" | "lower" | "grand";

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
  // Проход без соперника — только в первом раунде обычной сетки.
  const byeAllowed = m.round === 1 && (m.bracket ?? "upper") === "upper";
  if (byeAllowed && m.teamA && !m.teamB) return m.teamA;
  if (byeAllowed && m.teamB && !m.teamA) return m.teamB;
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

/** Итоговые места всех участников плей-офф: чем позже команда выбыла, тем выше место. */
export function finalPlacements(matches: Match[], teams: Team[]): Placement[] {
  if (matches.length === 0) return [];
  if (isDouble(matches)) return doublePlacements(matches, teams);
  const totalRounds = Math.max(...matches.map((m) => m.round));
  const final = matches.find((m) => m.round === totalRounds);
  if (!final) return [];
  const champ = matchWinner(final);
  if (!champ) return [];

  // Все проигравшие с раундом выбывания и разницей счёта.
  const losers = matches
    .map((m) => {
      const w = matchWinner(m);
      if (!w) return null;
      const loser = m.teamA === w ? m.teamB : m.teamA;
      if (!loser) return null;
      const diff =
        m.teamA === loser ? (m.scoreA ?? 0) - (m.scoreB ?? 0) : (m.scoreB ?? 0) - (m.scoreA ?? 0);
      return { id: loser, round: m.round, diff };
    })
    .filter((x): x is { id: string; round: number; diff: number } => !!x)
    .sort((a, b) => b.round - a.round || b.diff - a.diff);

  const ordered: string[] = [];
  for (const id of [champ, ...losers.map((l) => l.id)]) {
    if (!ordered.includes(id)) ordered.push(id);
  }

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


// ---------- Double Elimination ----------

export const isDouble = (matches: Match[]) => matches.some((m) => m.bracket === "lower" || m.bracket === "grand");

/** Подходит ли число команд для Double Elimination: 4, 8, 16, 32 или 64. */
export const doubleSizeOk = (n: number) => n >= 4 && n <= 64 && (n & (n - 1)) === 0;

export type DoubleMatchSpec = {
  key: string;
  bracket: Bracket;
  round: number;
  slot: number;
  team_a_id: string | null;
  team_b_id: string | null;
  next_key?: string;
  next_slot?: "a" | "b";
  loser_key?: string;
  loser_slot?: "a" | "b";
};

/**
 * Сетка Double Elimination: верхняя сетка, нижняя сетка и гранд-финал (один матч).
 * Проигравший в верхней сетке падает в нижнюю, проигравший в нижней — выбывает.
 */
export function buildDoubleBracket(teamIds: string[]): DoubleMatchSpec[] {
  const n = teamIds.length;
  if (!doubleSizeOk(n)) return [];
  const k = Math.log2(n);
  const key = (b: string, r: number, s: number) => `${b}${r}-${s}`;
  const out = new Map<string, DoubleMatchSpec>();
  const add = (b: Bracket, r: number, s: number, a: string | null = null, bb: string | null = null) =>
    out.set(key(b[0], r, s), { key: key(b[0], r, s), bracket: b, round: r, slot: s, team_a_id: a, team_b_id: bb });

  // Верхняя сетка
  for (let r = 1; r <= k; r++) {
    const count = n / 2 ** r;
    for (let s = 0; s < count; s++) add("upper", r, s, r === 1 ? teamIds[s * 2] : null, r === 1 ? teamIds[s * 2 + 1] : null);
  }
  // Нижняя сетка: 2(k-1) раундов
  const lowerRounds = 2 * (k - 1);
  const lowerCount = (r: number) => n / 2 ** (Math.floor((r + 1) / 2) + 1);
  for (let r = 1; r <= lowerRounds; r++) for (let s = 0; s < lowerCount(r); s++) add("lower", r, s);
  add("grand", 1, 0);

  const link = (from: string, field: "next" | "loser", to: string, slot: "a" | "b") => {
    const m = out.get(from)!;
    if (field === "next") Object.assign(m, { next_key: to, next_slot: slot });
    else Object.assign(m, { loser_key: to, loser_slot: slot });
  };

  for (let r = 1; r <= k; r++) {
    const count = n / 2 ** r;
    for (let s = 0; s < count; s++) {
      const from = key("u", r, s);
      // победитель
      if (r < k) link(from, "next", key("u", r + 1, Math.floor(s / 2)), s % 2 === 0 ? "a" : "b");
      else link(from, "next", key("g", 1, 0), "a");
      // проигравший
      if (r === 1) link(from, "loser", key("l", 1, Math.floor(s / 2)), s % 2 === 0 ? "a" : "b");
      else link(from, "loser", key("l", 2 * (r - 1), count - 1 - s), "b"); // обратный порядок — меньше повторных встреч
    }
  }
  for (let r = 1; r <= lowerRounds; r++) {
    const count = lowerCount(r);
    for (let s = 0; s < count; s++) {
      const from = key("l", r, s);
      if (r === lowerRounds) link(from, "next", key("g", 1, 0), "b");
      else if (r % 2 === 1) link(from, "next", key("l", r + 1, s), "a");
      else link(from, "next", key("l", r + 1, Math.floor(s / 2)), s % 2 === 0 ? "a" : "b");
    }
  }
  return [...out.values()];
}

/** Название раунда с учётом части сетки. */
export function stageName(m: Match, all: Match[]): string {
  const b = m.bracket ?? "upper";
  if (!isDouble(all)) return roundName(m.round, Math.max(...all.map((x) => x.round)));
  if (b === "grand") return "Гранд-финал";
  const total = Math.max(...all.filter((x) => (x.bracket ?? "upper") === b).map((x) => x.round));
  if (b === "upper") return m.round === total ? "Финал верхней сетки" : `Верхняя · ${roundName(m.round, total)}`;
  return m.round === total ? "Финал нижней сетки" : `Нижняя · раунд ${m.round}`;
}

/** Места в Double Elimination: 1 и 2 — гранд-финал, дальше — по раунду вылета из нижней сетки. */
function doublePlacements(matches: Match[], teams: Team[]): Placement[] {
  const grand = matches.find((m) => m.bracket === "grand");
  const champ = grand ? matchWinner(grand) : null;
  if (!grand || !champ) return [];
  const ordered: string[] = [champ];
  const runnerUp = grand.teamA === champ ? grand.teamB : grand.teamA;
  if (runnerUp) ordered.push(runnerUp);
  const losers = matches
    .filter((m) => m.bracket === "lower")
    .map((m) => {
      const w = matchWinner(m);
      if (!w) return null;
      const loser = m.teamA === w ? m.teamB : m.teamA;
      const diff = m.teamA === loser ? (m.scoreA ?? 0) - (m.scoreB ?? 0) : (m.scoreB ?? 0) - (m.scoreA ?? 0);
      return loser ? { id: loser, round: m.round, diff } : null;
    })
    .filter((x): x is { id: string; round: number; diff: number } => !!x)
    .sort((a, b) => b.round - a.round || b.diff - a.diff);
  for (const l of losers) if (!ordered.includes(l.id)) ordered.push(l.id);
  return ordered.map((id, i) => {
    const team = teams.find((t) => t.id === id);
    return { place: i + 1, teamName: team?.name ?? "—", logo: team?.logo, points: PLACE_POINTS[i + 1] ?? 0 };
  });
}
