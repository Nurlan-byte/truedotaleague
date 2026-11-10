/** Pure helpers for the «Моя команда» page (tested in my-team.test.ts). */

export type MembershipRow = { team_id: string; created_at: string };
export type OwnedTeamRow = { id: string; created_at: string };

/**
 * Picks the user's team deterministically: the newest team they are a roster
 * member of; otherwise the newest team they own (legacy owners without a roster row).
 */
export function pickMyTeamId(memberships: MembershipRow[], owned: OwnedTeamRow[]): string | null {
  const newest = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const m = newest(memberships);
  if (m) return m.team_id;
  const o = newest(owned);
  return o ? o.id : null;
}

export type RosterMember = { position: number; rating: number | null };

/** Sum of known ratings: main five (positions 0–4) and the whole roster. */
export function rosterMmr(members: RosterMember[]) {
  const sum = (rows: RosterMember[]) => rows.reduce((s, m) => s + (m.rating ?? 0), 0);
  const main = members.filter((m) => m.position < 5);
  return {
    main: sum(main),
    total: sum(members),
    unrated: members.filter((m) => m.rating == null).length,
  };
}

/** Human-readable load error that keeps the database code visible. */
export function loadErrorText(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const code = e?.code ? ` (код ${e.code})` : "";
  return `Не удалось загрузить команду${code}: ${e?.message || "неизвестная ошибка"}`;
}
