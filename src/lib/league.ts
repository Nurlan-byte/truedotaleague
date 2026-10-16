import type { Database } from "@/integrations/supabase/types";
import type { GroupMatch, Match, Team } from "@/lib/tournament";

/** Часовой пояс лиги. В базе всё хранится в UTC, показываем по Кызылорде. */
export const LEAGUE_TZ = "Asia/Qyzylorda";
export const LEAGUE_TZ_LABEL = "(UTC+5)";

export type TournamentStatus = Database["public"]["Enums"]["tournament_status"];
export type TournamentFormat = Database["public"]["Enums"]["tournament_format"];
export type ApplicationStatus = Database["public"]["Enums"]["application_status"];
export type TournamentRow = Database["public"]["Tables"]["tournaments"]["Row"];
export type ParticipantRow = Database["public"]["Tables"]["tournament_participants"]["Row"];
export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type GroupRow = Database["public"]["Tables"]["groups"]["Row"];
export type PlacementRow = Database["public"]["Tables"]["placements"]["Row"];

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Черновик",
  announced: "Анонсирован",
  registration_open: "Регистрация открыта",
  registration_closed: "Регистрация закрыта",
  live: "Идёт",
  finished: "Завершён",
  cancelled: "Отменён",
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  groups_playoff: "Групповой этап + плей-офф",
  single_elim: "Плей-офф (на выбывание)",
  round_robin: "Круговая система",
};

export const APPLICATION_LABEL: Record<ApplicationStatus, string> = {
  pending: "На рассмотрении",
  accepted: "Заявка принята",
  rejected: "Заявка отклонена",
  withdrawn: "Заявка отозвана",
};

/** «3 сент. 2026, 18:00 (UTC+5)» или null, если даты нет. */
export function formatLeagueDate(value: string | null | undefined, withTime = true): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const text = d.toLocaleString("ru-RU", {
    timeZone: LEAGUE_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
  return `${text} ${LEAGUE_TZ_LABEL}`;
}

/** Оставшееся время, никогда не отрицательное: «2 д 3 ч», «45 мин», «0 мин». */
export function countdown(target: string | null | undefined, now: number = Date.now()): string | null {
  if (!target) return null;
  const t = new Date(target).getTime();
  if (Number.isNaN(t)) return null;
  const ms = Math.max(0, t - now);
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rest = mins % 60;
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${rest} мин`;
  return `${rest} мин`;
}

export function freePlaces(teamLimit: number, accepted: number): number {
  return Math.max(0, teamLimit - accepted);
}

export function formatPrize(t: Pick<TournamentRow, "prize_tba" | "prize_amount" | "prize_currency">): string | null {
  if (t.prize_tba) return "Будет объявлен";
  if (t.prize_amount === null || t.prize_amount === undefined) return null;
  const amount = Number(t.prize_amount).toLocaleString("ru-RU");
  return t.prize_currency ? `${amount} ${t.prize_currency}` : amount;
}

const UPCOMING: TournamentStatus[] = ["registration_open", "registration_closed", "announced"];

/** Порядок каталога по умолчанию: идущие → ближайшие (регистрация/анонс) → завершённые (новые выше) → отменённые → черновики. */
export function catalogRank(status: TournamentStatus): number {
  if (status === "live") return 0;
  if (UPCOMING.includes(status)) return 1;
  if (status === "finished") return 2;
  if (status === "cancelled") return 3;
  return 4;
}

type Sortable = Pick<TournamentRow, "status" | "starts_at" | "title" | "created_at">;
const ts = (v: string | null) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY);

export type CatalogSort = "default" | "start_asc" | "start_desc" | "title";

export function sortCatalog<T extends Sortable>(list: T[], sort: CatalogSort = "default"): T[] {
  const out = [...list];
  if (sort === "title") return out.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  if (sort === "start_asc") return out.sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
  if (sort === "start_desc")
    return out.sort((a, b) => (b.starts_at ? ts(b.starts_at) : -Infinity) - (a.starts_at ? ts(a.starts_at) : -Infinity));
  return out.sort((a, b) => {
    const r = catalogRank(a.status) - catalogRank(b.status);
    if (r !== 0) return r;
    if (a.status === "finished" || a.status === "cancelled")
      return (b.starts_at ? ts(b.starts_at) : 0) - (a.starts_at ? ts(a.starts_at) : 0);
    return ts(a.starts_at) - ts(b.starts_at);
  });
}

/** Число команд, которые реально сыграли хотя бы один матч с результатом. */
export function teamsThatPlayed(matches: Pick<MatchRow, "team_a_id" | "team_b_id" | "score_a" | "score_b">[]): number {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.score_a === null || m.score_b === null) continue;
    if (m.team_a_id) ids.add(m.team_a_id);
    if (m.team_b_id) ids.add(m.team_b_id);
  }
  return ids.size;
}

/** Ближайший запланированный, ещё не сыгранный матч. */
export function nextMatch<T extends Pick<MatchRow, "scheduled_at" | "score_a">>(matches: T[], now = Date.now()): T | null {
  return (
    matches
      .filter((m) => m.scheduled_at && m.score_a === null && new Date(m.scheduled_at).getTime() >= now)
      .sort((a, b) => ts(a.scheduled_at) - ts(b.scheduled_at))[0] ?? null
  );
}

/** Перевод строк БД в формат существующих компонентов сетки и групп. */
export function toViewModel(participants: ParticipantRow[], matches: MatchRow[], groups: GroupRow[]) {
  const teams: Team[] = participants.map((p) => ({ id: p.team_id, name: p.team_name, logo: p.logo_url ?? undefined }));
  const byId = new Map(teams.map((t) => [t.id, t]));
  const sortedGroups = [...groups].sort((a, b) => a.idx - b.idx);
  const groupIndex = new Map(sortedGroups.map((g) => [g.id, g.idx]));
  const groupTeams: Team[][] = sortedGroups.map((g) =>
    g.team_ids.map((id) => byId.get(id)).filter((t): t is Team => !!t),
  );
  const bracket: Match[] = matches
    .filter((m) => m.stage === "playoff")
    .map((m) => ({
      id: m.id,
      round: m.round,
      order: m.slot,
      teamA: m.team_a_id,
      teamB: m.team_b_id,
      scoreA: m.score_a,
      scoreB: m.score_b,
      scheduledAt: m.scheduled_at,
    }));
  const groupMatches: GroupMatch[] = matches
    .filter((m) => m.stage === "group" && m.group_id && m.team_a_id && m.team_b_id)
    .map((m) => ({
      id: m.id,
      group: groupIndex.get(m.group_id!) ?? 0,
      teamA: m.team_a_id!,
      teamB: m.team_b_id!,
      scoreA: m.score_a,
      scoreB: m.score_b,
      scheduledAt: m.scheduled_at,
    }));
  return { teams, groups: groupTeams, bracket, groupMatches };
}

const ERRORS: Record<string, string> = {
  not_authenticated: "Войдите в аккаунт",
  registration_not_open: "Регистрация ещё не открыта",
  registration_closed: "Регистрация уже закрыта",
  not_team_captain: "Подать заявку может только владелец или капитан команды",
  regulation_not_acknowledged: "Нужно ознакомиться с опубликованным регламентом",
  tournament_full: "Свободных мест больше нет",
  deadline_passed: "Срок отзыва заявки истёк",
  application_not_active: "Заявка уже не активна",
  application_not_pending: "Заявка уже рассмотрена",
  conflict_of_interest: "Нельзя рассматривать заявку своей команды",
  reason_required: "Укажите причину",
  forbidden: "Недостаточно прав",
  idempotency_key_required: "Ошибка формы, обновите страницу",
};

export function rpcErrorText(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? "";
  for (const [key, text] of Object.entries(ERRORS)) if (msg.includes(key)) return text;
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}
