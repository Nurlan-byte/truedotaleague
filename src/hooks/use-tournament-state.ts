import { useCallback, useEffect, useState } from "react";
import {
  buildBracket,
  buildGroups,
  finalPlacements,
  groupPlacements,
  propagate,
  standings,
  uid,
  PLACE_POINTS,
  type Application,
  type GroupMatch,
  type Match,
  type Placement,
  type RosterTeam,
  type Team,
  type TournamentRecord,
} from "@/lib/tournament";

const STORAGE_KEY = "tdl-tournament-state";
const SYNC_EVENT = "tdl-state-sync";
const DATA_VERSION = 3;

export type TournamentState = {
  version: number;
  title: string;
  teams: Team[];
  bracket: Match[];
  groups: Team[][];
  groupMatches: GroupMatch[];
  groupCount: number;
  /** Команды, созданные капитанами (постоянные составы). */
  roster: RosterTeam[];
  /** Заявки на участие в турнире (проверяет админ). */
  applications: Application[];
  history: TournamentRecord[];
};

export const initialState: TournamentState = {
  version: DATA_VERSION,
  title: "Кубок сезона",
  teams: [],
  bracket: [],
  groups: [],
  groupMatches: [],
  groupCount: 2,
  roster: [],
  applications: [],
  history: [],
};

function read(): TournamentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = { ...initialState, ...JSON.parse(raw) } as TournamentState;
    // Разовая чистка: старые тестовые команды и незавершённая сетка удаляются.
    if (parsed.version !== DATA_VERSION) {
      return {
        ...parsed,
        version: DATA_VERSION,
        teams: [],
        bracket: [],
        groups: [],
        groupMatches: [],
      };
    }
    return parsed;
  } catch {
    return initialState;
  }
}

/** Итоговые места: плей-офф + остальные участники по групповому этапу. */
function resolvePlacements(s: TournamentState): Placement[] {
  const fromBracket = finalPlacements(s.bracket, s.teams);
  const fromGroups = groupPlacements(s.groups, s.groupMatches);
  if (fromBracket.length === 0) return fromGroups;
  const seen = new Set(fromBracket.map((p) => p.teamName));
  const rest = fromGroups.filter((p) => !seen.has(p.teamName));
  return [...fromBracket, ...rest].map((p, i) => ({
    ...p,
    place: i + 1,
    points: PLACE_POINTS[i + 1] ?? 0,
  }));
}

export function useTournamentState() {
  const [state, setStateRaw] = useState<TournamentState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStateRaw(read());
    setReady(true);
    const onSync = () => setStateRaw(read());
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const refresh = useCallback(() => setStateRaw(read()), []);

  const setState = useCallback((updater: (s: TournamentState) => TournamentState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage full — keep app usable */
      }
      window.dispatchEvent(new Event(SYNC_EVENT));
      return next;
    });
  }, []);

  const parseScore = (v: string) => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const actions = {
    setTitle: (title: string) => setState((s) => ({ ...s, title })),
    setGroupCount: (groupCount: number) => setState((s) => ({ ...s, groupCount })),
    addTeams: (raw: string, owner?: { id: string; name?: string }) => {
      const names = raw
        .split(/[\n,]/)
        .map((n) => n.trim())
        .filter(Boolean);
      if (!names.length) return;
      setState((s) => {
        const taken = new Set(s.teams.map((t) => t.name.toLowerCase()));
        const fresh = names
          .filter((n) => {
            const key = n.toLowerCase();
            if (taken.has(key)) return false;
            taken.add(key);
            return true;
          })
          .map((n) => ({
            id: uid(),
            name: n,
            registeredAt: new Date().toLocaleDateString("ru-RU"),
            ownerId: owner?.id,
            ownerName: owner?.name,
          }));
        if (!fresh.length) return s;
        return { ...s, teams: [...s.teams, ...fresh] };
      });
    },
    removeTeam: (id: string) =>
      setState((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) })),
    clearTeams: () =>
      setState((s) => ({ ...s, teams: [], groups: [], groupMatches: [], bracket: [] })),
    setTeamLogo: (id: string, logo: string) =>
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id ? { ...t, logo } : t)),
        groups: s.groups.map((g) => g.map((t) => (t.id === id ? { ...t, logo } : t))),
      })),

    /* ---------- Мои команды (постоянные составы) ---------- */
    createRosterTeam: (
      data: { name: string; tag?: string; logo?: string },
      owner: { id: string; name?: string },
    ) => {
      const name = data.name.trim();
      if (!name) return;
      setState((s) => {
        if (s.roster.some((t) => t.name.toLowerCase() === name.toLowerCase())) return s;
        return {
          ...s,
          roster: [
            ...s.roster,
            {
              id: uid(),
              name,
              tag: data.tag?.trim() || undefined,
              logo: data.logo,
              ownerId: owner.id,
              ownerName: owner.name,
              createdAt: new Date().toLocaleDateString("ru-RU"),
              players: [],
            },
          ],
        };
      });
    },
    updateRosterTeam: (id: string, patch: Partial<Omit<RosterTeam, "id" | "ownerId">>) =>
      setState((s) => ({
        ...s,
        roster: s.roster.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        // Название и логотип синхронизируются с уже поданной заявкой.
        teams: s.teams.map((t) =>
          t.rosterId === id ? { ...t, name: patch.name ?? t.name, logo: patch.logo ?? t.logo } : t,
        ),
      })),
    removeRosterTeam: (id: string) =>
      setState((s) => ({
        ...s,
        roster: s.roster.filter((t) => t.id !== id),
        teams: s.teams.filter((t) => t.rosterId !== id),
      })),
    addRosterPlayer: (teamId: string, nickname: string, role?: string, mmr?: number | null) => {
      const nick = nickname.trim();
      if (!nick) return;
      setState((s) => ({
        ...s,
        roster: s.roster.map((t) =>
          t.id === teamId && t.players.length < 7
            ? {
                ...t,
                players: [
                  ...t.players,
                  { id: uid(), nickname: nick, role: role?.trim() || undefined, mmr: mmr ?? null },
                ],
              }
            : t,
        ),
      }));
    },
    removeRosterPlayer: (teamId: string, playerId: string) =>
      setState((s) => ({
        ...s,
        roster: s.roster.map((t) =>
          t.id === teamId ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t,
        ),
      })),
    /** Подать заявку составом на текущий турнир — уходит админам на рассмотрение. */
    applyToTournament: (teamId: string) =>
      setState((s) => {
        const team = s.roster.find((t) => t.id === teamId);
        if (!team) return s;
        if (s.teams.some((t) => t.rosterId === teamId)) return s;
        if (s.applications.some((a) => a.rosterId === teamId && a.status === "pending")) return s;
        return {
          ...s,
          applications: [
            {
              id: uid(),
              rosterId: team.id,
              teamName: team.name,
              tag: team.tag,
              logo: team.logo,
              ownerId: team.ownerId,
              ownerName: team.ownerName,
              playersCount: team.players.length,
              submittedAt: new Date().toLocaleString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
              status: "pending",
            },
            ...s.applications,
          ],
        };
      }),
    /** Админ принимает заявку: команда попадает в список участников. */
    approveApplication: (appId: string) =>
      setState((s) => {
        const app = s.applications.find((a) => a.id === appId);
        if (!app) return s;
        const dup =
          s.teams.some((t) => t.rosterId === app.rosterId) ||
          s.teams.some((t) => t.name.toLowerCase() === app.teamName.toLowerCase());
        return {
          ...s,
          applications: s.applications.map((a) =>
            a.id === appId ? { ...a, status: "approved" } : a,
          ),
          teams: dup
            ? s.teams
            : [
                ...s.teams,
                {
                  id: uid(),
                  name: app.teamName,
                  logo: app.logo,
                  registeredAt: new Date().toLocaleDateString("ru-RU"),
                  ownerId: app.ownerId,
                  ownerName: app.ownerName,
                  rosterId: app.rosterId,
                },
              ],
        };
      }),
    /** Админ отклоняет заявку. */
    rejectApplication: (appId: string, note?: string) =>
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) =>
          a.id === appId ? { ...a, status: "rejected", note: note?.trim() || undefined } : a,
        ),
        teams: s.teams.filter((t) => {
          const app = s.applications.find((a) => a.id === appId);
          return !app || t.rosterId !== app.rosterId;
        }),
      })),
    /** Снять заявку своей команды с турнира. */
    withdrawApplication: (teamId: string) =>
      setState((s) => ({
        ...s,
        teams: s.teams.filter((t) => t.rosterId !== teamId),
        applications: s.applications.filter((a) => a.rosterId !== teamId),
      })),

    setBracketScore: (id: string, side: "A" | "B", value: string) =>
      setState((s) => ({
        ...s,
        bracket: propagate(
          s.bracket.map((m) =>
            m.id === id ? { ...m, [side === "A" ? "scoreA" : "scoreB"]: parseScore(value) } : m,
          ),
        ),
      })),
    setGroupScore: (id: string, side: "A" | "B", value: string) =>
      setState((s) => ({
        ...s,
        groupMatches: s.groupMatches.map((m) =>
          m.id === id ? { ...m, [side === "A" ? "scoreA" : "scoreB"]: parseScore(value) } : m,
        ),
      })),
    /** Дата и время матча (значение input[type=datetime-local]). */
    setMatchTime: (id: string, value: string) =>
      setState((s) => ({
        ...s,
        bracket: s.bracket.map((m) => (m.id === id ? { ...m, scheduledAt: value || null } : m)),
        groupMatches: s.groupMatches.map((m) =>
          m.id === id ? { ...m, scheduledAt: value || null } : m,
        ),
      })),

    generateBracket: (teams: Team[]) => setState((s) => ({ ...s, bracket: buildBracket(teams) })),
    generateGroups: () =>
      setState((s) => {
        const { groups, matches } = buildGroups(s.teams, Math.max(1, s.groupCount));
        return { ...s, groups, groupMatches: matches };
      }),
    playoffFromGroups: () =>
      setState((s) => {
        const qualified = s.groups.flatMap((g, gi) =>
          standings(
            g,
            s.groupMatches.filter((m) => m.group === gi),
          )
            .slice(0, 2)
            .map((row) => g.find((t) => t.id === row.teamId)!)
            .filter(Boolean),
        );
        if (qualified.length < 2) return s;
        return { ...s, bracket: buildBracket(qualified) };
      }),
    finishTournament: () =>
      setState((s) => {
        const placements = resolvePlacements(s);
        if (placements.length === 0) return s;
        return {
          ...s,
          // Турнир уходит в архив: расписание, группы и сетка очищаются.
          bracket: [],
          groups: [],
          groupMatches: [],
          history: [
            {
              id: uid(),
              title: s.title,
              date: new Date().toLocaleDateString("ru-RU"),
              placements,
              // Снимок турнира — чтобы в архиве можно было открыть сетку и группы.
              teams: s.teams,
              bracket: s.bracket,
              groups: s.groups,
              groupMatches: s.groupMatches,
            },
            ...s.history,
          ],
        };
      }),
    removeTournament: (id: string) =>
      setState((s) => ({ ...s, history: s.history.filter((t) => t.id !== id) })),
    clearHistory: () => setState((s) => ({ ...s, history: [] })),
    reset: () => setState((s) => ({ ...initialState, history: s.history })),
  };

  return { state, ready, actions, refresh, placements: resolvePlacements(state) };
}
