import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildBracket, buildGroups, type GroupMatch, type Match, type Team } from "@/lib/tournament";
import type { TournamentFormat, TournamentRow } from "@/lib/league";

/** Лига живёт по Кызылорде: фиксированный UTC+5 без перехода на летнее время. */
export const LEAGUE_OFFSET_MIN = 5 * 60;

/** ISO (UTC) → значение для <input type="datetime-local"> во времени лиги. */
export function toLeagueInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + LEAGUE_OFFSET_MIN * 60000).toISOString().slice(0, 16);
}

/** Значение datetime-local во времени лиги → ISO UTC. Пусто → null. */
export function fromLeagueInput(value: string): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - LEAGUE_OFFSET_MIN * 60000;
  return new Date(utc).toISOString();
}

export type TournamentForm = {
  title: string;
  image_url: string;
  starts_at: string; // datetime-local, UTC+5
  reg_manual: boolean;
  registration_opens_at: string;
  registration_closes_at: string;
  mode: "online" | "offline";
  venue_name: string;
  venue_address: string;
  prize_tba: boolean;
  prize_amount: string;
  prize_currency: string;
  team_limit: string;
  description: string;
  format: TournamentFormat;
};

export const emptyForm = (): TournamentForm => ({
  title: "",
  image_url: "",
  starts_at: "",
  reg_manual: true,
  registration_opens_at: "",
  registration_closes_at: "",
  mode: "online",
  venue_name: "",
  venue_address: "",
  prize_tba: true,
  prize_amount: "",
  prize_currency: "KZT",
  team_limit: "16",
  description: "",
  format: "single_elim",
});

export function formFromRow(t: TournamentRow): TournamentForm {
  return {
    title: t.title,
    image_url: t.image_url ?? "",
    starts_at: toLeagueInput(t.starts_at),
    reg_manual: !t.registration_opens_at,
    registration_opens_at: toLeagueInput(t.registration_opens_at),
    registration_closes_at: toLeagueInput(t.registration_closes_at),
    mode: t.mode,
    venue_name: t.venue_name ?? "",
    venue_address: t.venue_address ?? "",
    prize_tba: t.prize_tba,
    prize_amount: t.prize_amount === null ? "" : String(t.prize_amount),
    prize_currency: t.prize_currency ?? "KZT",
    team_limit: String(t.team_limit),
    description: t.description,
    format: t.format,
  };
}

/** Ошибки формы. `publish` — строгая проверка перед публикацией. */
export function validateForm(f: TournamentForm, publish: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const start = fromLeagueInput(f.starts_at);
  const close = fromLeagueInput(f.registration_closes_at);
  const open = f.reg_manual ? null : fromLeagueInput(f.registration_opens_at);
  if (publish && !f.title.trim()) e.title = "Укажите название";
  if (publish && !start) e.starts_at = "Укажите дату и время начала";
  if (publish && !close) e.registration_closes_at = "Укажите закрытие регистрации";
  if (!f.reg_manual && !open && publish) e.registration_opens_at = "Укажите время открытия или выберите «вручную»";
  if (start && close && close > start) e.registration_closes_at = "Закрытие регистрации не может быть позже начала";
  if (open && close && open >= close) e.registration_opens_at = "Открытие должно быть раньше закрытия";
  if (f.mode === "offline" && (!f.venue_name.trim() || !f.venue_address.trim()))
    e.venue = "Для офлайн-турнира укажите площадку и адрес";
  if (!f.prize_tba) {
    const n = Number(f.prize_amount.replace(",", "."));
    if (f.prize_amount.trim() === "" || !Number.isFinite(n) || n < 0) e.prize = "Сумма должна быть числом ≥ 0";
    else if (!f.prize_currency.trim()) e.prize = "Укажите валюту";
  }
  const lim = Number(f.team_limit);
  if (!Number.isInteger(lim) || lim < 2) e.team_limit = "Лимит команд — целое число не меньше 2";
  return e;
}

export function formToPayload(f: TournamentForm) {
  return {
    title: f.title.trim(),
    image_url: f.image_url || null,
    starts_at: fromLeagueInput(f.starts_at),
    registration_opens_at: f.reg_manual ? null : fromLeagueInput(f.registration_opens_at),
    registration_closes_at: fromLeagueInput(f.registration_closes_at),
    mode: f.mode,
    venue_name: f.mode === "offline" ? f.venue_name.trim() : null,
    venue_address: f.mode === "offline" ? f.venue_address.trim() : null,
    prize_tba: f.prize_tba,
    prize_amount: f.prize_tba ? null : Number(f.prize_amount.replace(",", ".")),
    prize_currency: f.prize_tba ? null : f.prize_currency.trim(),
    team_limit: Number(f.team_limit),
    description: f.description,
    format: f.format,
  };
}

/** Состав изменён после подачи/принятия заявки? Сравниваем ники по порядку. */
export function rosterChanged(snapshot: unknown, live: { nickname: string; position?: number }[]): boolean {
  const snap = ((snapshot as { members?: { nickname: string }[] })?.members ?? []).map((m) => m.nickname.trim().toLowerCase());
  const now = [...live]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((m) => m.nickname.trim().toLowerCase());
  return snap.length !== now.length || snap.some((n, i) => n !== now[i]);
}

/** Сетка → payload для generate_structure. */
export function bracketPayload(teams: Team[]) {
  return {
    matches: buildBracket(teams).map((m) => ({
        round: m.round,
        slot: m.order,
        team_a_id: m.round === 1 ? m.teamA : null,
        team_b_id: m.round === 1 ? m.teamB : null,
      })),
  };
}

export function groupsPayload(teams: Team[], groupCount: number) {
  const { groups, matches } = buildGroups(teams, groupCount);
  return {
    groups: groups.map((g, i) => ({ name: `Группа ${String.fromCharCode(65 + i)}`, team_ids: g.map((t) => t.id) })),
    matches: matches.map((m) => ({ group_idx: m.group, team_a_id: m.teamA, team_b_id: m.teamB })),
  };
}

// ---------- Legacy localStorage ----------
export const LEGACY_KEY = "tdl-tournament-state";

type LegacyState = {
  title?: string;
  teams?: Team[];
  bracket?: Match[];
  groups?: Team[][];
  groupMatches?: GroupMatch[];
  roster?: { id: string; name: string; tag?: string; logo?: string; players?: { nickname: string; role?: string; mmr?: number | null }[] }[];
  applications?: { id: string; teamName: string; status: string; playersCount: number }[];
  history?: {
    id: string;
    title: string;
    date: string;
    placements: { place: number; teamName: string; logo?: string }[];
    teams?: Team[];
    bracket?: Match[];
    groups?: Team[][];
    groupMatches?: GroupMatch[];
  }[];
};

export function readLegacy(): LegacyState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LegacyState) : null;
  } catch {
    return null;
  }
}
export type { LegacyState };

/** «03.09.2026» или ISO → ISO; иначе null. */
export function legacyDate(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(v);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 7)).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- Queries ----------
export const isStaffQuery = (tournamentId: string, uid: string | undefined) =>
  queryOptions({
    queryKey: ["league", "staff", tournamentId, uid ?? "guest"],
    enabled: !!uid,
    queryFn: async () => {
      if (!uid) return false;
      const { data } = await supabase.rpc("is_staff_for", { _uid: uid, _tournament_id: tournamentId });
      return !!data;
    },
  });

export const tournamentApplicationsQuery = (tournamentId: string) =>
  queryOptions({
    queryKey: ["league", "t-applications", tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, teams(name, tag, owner_id, team_members(nickname, position, profile_id), team_captains(user_id))")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const auditQuery = (tournamentId: string) =>
  queryOptions({
    queryKey: ["league", "audit", tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

export const usersWithRolesQuery = () =>
  queryOptions({
    queryKey: ["league", "users-roles"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, nickname, avatar_url, team_name").order("nickname"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const role = new Map((r.data ?? []).map((x) => [x.user_id, x.role]));
      return (p.data ?? []).map((u) => ({ ...u, role: role.get(u.id) ?? ("user" as const) }));
    },
  });

export const moderatorAssignmentsQuery = (tournamentId?: string) =>
  queryOptions({
    queryKey: ["league", "mod-assignments", tournamentId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("tournament_moderators")
        .select("*, tournaments(title)")
        .is("revoked_at", null)
        .order("assigned_at", { ascending: false });
      if (tournamentId) q = q.eq("tournament_id", tournamentId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const regulationVersionsQuery = () =>
  queryOptions({
    queryKey: ["league", "regulation-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulation_versions")
        .select("*")
        .order("version", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

/** Действующая сейчас опубликованная версия регламента (effective_from ≤ now). */
export const effectiveRegulationQuery = () =>
  queryOptions({
    queryKey: ["league", "regulation-effective"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulation_versions")
        .select("id, effective_from, published_at")
        .eq("status", "published")
        .lte("effective_from", new Date().toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const AUDIT_LABEL: Record<string, string> = {
  create_tournament: "Турнир создан",
  update_tournament: "Изменены данные турнира",
  change_tournament_status: "Изменён статус",
  finish_tournament: "Итоги зафиксированы",
  accept_application: "Заявка принята",
  reject_application: "Заявка отклонена",
  submit_application: "Подана заявка",
  withdraw_application: "Заявка отозвана",
  set_match_score: "Счёт матча",
  set_match_schedule: "Время матча",
  generate_groups: "Сформированы группы",
  generate_bracket: "Сформирована сетка",
  assign_moderator: "Назначен модератор",
  revoke_moderator: "Снят модератор",
  reacknowledge_regulation: "Подтверждён новый регламент",
  import_legacy_tournament: "Импорт из старой версии",
};

const TRACKED = ["title", "starts_at", "registration_opens_at", "registration_closes_at", "mode", "venue_name", "venue_address", "prize_amount", "prize_currency", "prize_tba", "team_limit", "format", "status", "description", "image_url"];

/** Список изменённых полей между before/after (для истории изменений). */
export function changedFields(before: unknown, after: unknown): string[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return TRACKED.filter((k) => k in a && JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null));
}
