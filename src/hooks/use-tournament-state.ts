import { useCallback, useEffect, useState } from "react";
import {
  buildBracket,
  buildGroups,
  finalPlacements,
  propagate,
  standings,
  uid,
  type GroupMatch,
  type Match,
  type Team,
  type TournamentRecord,
} from "@/lib/tournament";

const STORAGE_KEY = "tdl-tournament-state";
const SYNC_EVENT = "tdl-state-sync";

export type TournamentState = {
  title: string;
  teams: Team[];
  bracket: Match[];
  groups: Team[][];
  groupMatches: GroupMatch[];
  groupCount: number;
  history: TournamentRecord[];
};

export const initialState: TournamentState = {
  title: "Кубок сезона",
  teams: [],
  bracket: [],
  groups: [],
  groupMatches: [],
  groupCount: 2,
  history: [],
};

function read(): TournamentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...initialState, ...JSON.parse(raw) } : initialState;
  } catch {
    return initialState;
  }
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

  const setState = useCallback(
    (updater: (s: TournamentState) => TournamentState) => {
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
    },
    [],
  );

  const parseScore = (v: string) => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const actions = {
    setTitle: (title: string) => setState((s) => ({ ...s, title })),
    setGroupCount: (groupCount: number) => setState((s) => ({ ...s, groupCount })),
    addTeams: (raw: string) => {
      const names = raw
        .split(/[\n,]/)
        .map((n) => n.trim())
        .filter(Boolean);
      if (!names.length) return;
      setState((s) => ({
        ...s,
        teams: [...s.teams, ...names.map((n) => ({ id: uid(), name: n }))],
      }));
    },
    removeTeam: (id: string) =>
      setState((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) })),
    setTeamLogo: (id: string, logo: string) =>
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id ? { ...t, logo } : t)),
        groups: s.groups.map((g) => g.map((t) => (t.id === id ? { ...t, logo } : t))),
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
        const placements = finalPlacements(s.bracket, s.teams);
        if (placements.length === 0) return s;
        return {
          ...s,
          history: [
            {
              id: uid(),
              title: s.title,
              date: new Date().toLocaleDateString("ru-RU"),
              placements,
            },
            ...s.history,
          ],
        };
      }),
    reset: () => setState((s) => ({ ...initialState, history: s.history })),
  };

  return { state, ready, actions, placements: finalPlacements(state.bracket, state.teams) };
}
