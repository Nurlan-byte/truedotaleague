import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  Shuffle,
  Trash2,
  Users,
  Swords,
  LayoutGrid,
  Trophy,
  ImagePlus,
  LogIn,
  LogOut,
} from "lucide-react";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import { RankingView } from "@/components/RankingView";
import { TeamLogo } from "@/components/TeamLogo";
import { useAuth } from "@/hooks/use-auth";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";

import {
  buildBracket,
  buildGroups,
  finalPlacements,
  propagate,
  shuffle,
  standings,
  uid,
  type GroupMatch,
  type Match,
  type Team,
  type TournamentRecord,
} from "@/lib/tournament";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrueDotaLeague — сетки турниров, плей-офф и группы" },
      {
        name: "description",
        content:
          "Создавайте турниры за минуту: список команд, групповой этап с таблицами и сетка плей-офф с автоматическим продвижением победителей.",
      },
      { property: "og:title", content: "TrueDotaLeague — конструктор турнирных сеток" },
      {
        property: "og:description",
        content:
          "Групповой этап, таблицы и сетка плей-офф онлайн. Введите команды и получите готовый турнир.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STORAGE_KEY = "tdl-tournament-state";

type State = {
  title: string;
  teams: Team[];
  bracket: Match[];
  groups: Team[][];
  groupMatches: GroupMatch[];
  groupCount: number;
  history: TournamentRecord[];
};

const initial: State = {
  title: "Кубок сезона",
  teams: [],
  bracket: [],
  groups: [],
  groupMatches: [],
  groupCount: 2,
  history: [],
};

function Index() {
  const [state, setState] = useState<State>(initial);
  const [tab, setTab] = useState<"groups" | "playoff" | "rating">("playoff");
  const [name, setName] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const { user, profile, signOut } = useAuth();


  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setState({ ...initial, ...JSON.parse(raw) });
      } catch {
        /* ignore corrupted state */
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full — keep app usable */
    }
  }, [state]);

  const addTeam = (raw: string) => {
    const names = raw
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    setState((s) => ({
      ...s,
      teams: [...s.teams, ...names.map((n) => ({ id: uid(), name: n }))],
    }));
    setName("");
  };

  const parseScore = (v: string) => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const setBracketScore = (id: string, side: "A" | "B", value: string) =>
    setState((s) => ({
      ...s,
      bracket: propagate(
        s.bracket.map((m) =>
          m.id === id
            ? { ...m, [side === "A" ? "scoreA" : "scoreB"]: parseScore(value) }
            : m,
        ),
      ),
    }));

  const setGroupScore = (id: string, side: "A" | "B", value: string) =>
    setState((s) => ({
      ...s,
      groupMatches: s.groupMatches.map((m) =>
        m.id === id ? { ...m, [side === "A" ? "scoreA" : "scoreB"]: parseScore(value) } : m,
      ),
    }));

  const generateBracket = (teams: Team[]) =>
    setState((s) => ({ ...s, bracket: buildBracket(teams) }));

  const generateGroups = () =>
    setState((s) => {
      const { groups, matches } = buildGroups(s.teams, Math.max(1, s.groupCount));
      return { ...s, groups, groupMatches: matches };
    });

  const playoffFromGroups = () => {
    const qualified = state.groups.flatMap((g) =>
      standings(
        g,
        state.groupMatches.filter((m) => state.groups.indexOf(g) === m.group),
      )
        .slice(0, 2)
        .map((s) => g.find((t) => t.id === s.teamId)!)
        .filter(Boolean),
    );
    if (qualified.length < 2) return;
    generateBracket(qualified);
    setTab("playoff");
  };

  const setLogo = async (id: string, file: File | undefined) => {
    if (!file) return;
    try {
      const logo = await fileToLogoDataUrl(file);
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id ? { ...t, logo } : t)),
        groups: s.groups.map((g) => g.map((t) => (t.id === id ? { ...t, logo } : t))),
      }));
      setLogoError(null);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "Не удалось загрузить логотип");
    }
  };

  const placements = finalPlacements(state.bracket, state.teams);

  const finishTournament = () => {
    if (placements.length === 0) return;
    setState((s) => ({
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
    }));
    setTab("rating");
  };

  const resetAll = () => setState((s) => ({ ...initial, history: s.history }));

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.35em] text-primary">
            TrueDotaLeague
          </p>
          <h1 className="mt-1 text-4xl leading-none text-foreground sm:text-6xl">
            Лига по Дота 2
          </h1>
          <input
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            className="mt-3 w-full max-w-sm rounded-lg border border-input bg-white/70 px-3 py-1.5 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
            aria-label="Название турнира"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <>
              <Link
                to="/profile"
                className="rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-foreground backdrop-blur-sm transition-colors hover:text-primary"
              >
                {profile?.nickname || user.email}
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary"
              >
                <LogOut className="size-4" /> Выйти
              </button>
            </>

          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              <LogIn className="size-4" /> Регистрация / вход
            </Link>
          )}
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Сбросить турнир
          </button>
        </div>

      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="panel h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 text-2xl text-foreground">
            <Users className="size-5 text-primary" /> Команды ({state.teams.length})
          </h2>

          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTeam(name)}
              placeholder="Название команды"
              className="min-w-0 flex-1 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
            />
            <button
              onClick={() => addTeam(name)}
              className="inline-flex items-center rounded-lg bg-primary px-3 text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
              aria-label="Добавить команду"
            >
              <Plus className="size-4" />
            </button>
          </div>
          {logoError && (
            <p className="mt-2 text-xs font-semibold text-destructive">{logoError}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Можно вставить сразу несколько названий через запятую.
          </p>

          <ul className="mt-4 space-y-1.5">
            {state.teams.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm text-foreground backdrop-blur-sm"
              >
                <span className="w-5 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <TeamLogo name={t.name} logo={t.logo} size="md" />
                <span className="flex-1 truncate">{t.name}</span>
                <label
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
                  title="Загрузить логотип"
                >
                  <ImagePlus className="size-4" />
                  <span className="sr-only">Логотип команды {t.name}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const vErr = validateLogoFile(f);
                        if (vErr) {
                          setLogoError(vErr);
                        } else {
                          void setLogo(t.id, f);
                        }
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() =>
                    setState((s) => ({ ...s, teams: s.teams.filter((x) => x.id !== t.id) }))
                  }
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Удалить ${t.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2 border-t border-border pt-5">
            <button
              onClick={() => generateBracket(shuffle(state.teams))}
              disabled={state.teams.length < 2}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            >
              <Shuffle className="size-4" /> Сгенерировать плей-офф
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="gc">
                Групп
              </label>
              <input
                id="gc"
                type="number"
                min={1}
                max={8}
                value={state.groupCount}
                onChange={(e) =>
                  setState((s) => ({ ...s, groupCount: Number(e.target.value) || 1 }))
                }
                className="w-16 rounded-lg border border-input bg-white/70 px-2 py-1.5 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
              />
              <button
                onClick={generateGroups}
                disabled={state.teams.length < 2}
                className="flex-1 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                Создать группы
              </button>
            </div>

            <button
              onClick={playoffFromGroups}
              disabled={state.groups.length === 0}
              className="w-full rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Плей-офф из топ-2 групп
            </button>

            <button
              onClick={finishTournament}
              disabled={placements.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-accent-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            >
              <Trophy className="size-4" /> Завершить турнир
            </button>
            <p className="text-xs text-muted-foreground">
              Начислим TDL points: 1 место — 50, 2 — 25, 3 — 12, 4 — 6.
            </p>
          </div>
        </aside>

        <section>
          <div className="mb-5 inline-flex flex-wrap rounded-xl border border-border bg-white/70 p-1 backdrop-blur-sm">
            {(
              [
                ["playoff", "Плей-офф", Swords],
                ["groups", "Группы", LayoutGrid],
                ["rating", "Рейтинг", Trophy],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                  tab === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          {tab === "playoff" && (
            <BracketView
              matches={state.bracket}
              teams={state.teams}
              onScore={setBracketScore}
            />
          )}
          {tab === "groups" && (
            <GroupStage
              groups={state.groups}
              matches={state.groupMatches}
              onScore={setGroupScore}
            />
          )}
          {tab === "rating" && <RankingView history={state.history} />}
        </section>
      </div>
    </main>
  );
}
