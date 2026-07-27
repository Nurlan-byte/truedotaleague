import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Shuffle, Trash2, Users, Swords, LayoutGrid } from "lucide-react";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import {
  buildBracket,
  buildGroups,
  propagate,
  shuffle,
  standings,
  uid,
  type GroupMatch,
  type Match,
  type Team,
} from "@/lib/tournament";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bracketa — сетки турниров, плей-офф и группы" },
      {
        name: "description",
        content:
          "Создавайте турниры за минуту: список команд, групповой этап с таблицами и сетка плей-офф с автоматическим продвижением победителей.",
      },
      { property: "og:title", content: "Bracketa — конструктор турнирных сеток" },
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

const STORAGE_KEY = "bracketa-state";

type State = {
  title: string;
  teams: Team[];
  bracket: Match[];
  groups: Team[][];
  groupMatches: GroupMatch[];
  groupCount: number;
};

const initial: State = {
  title: "Кубок сезона",
  teams: [],
  bracket: [],
  groups: [],
  groupMatches: [],
  groupCount: 2,
};

function Index() {
  const [state, setState] = useState<State>(initial);
  const [tab, setTab] = useState<"groups" | "playoff">("playoff");
  const [name, setName] = useState("");

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  const resetAll = () => setState(initial);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-primary">Bracketa</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">
            Организатор турниров
          </h1>
          <input
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            className="mt-3 w-full max-w-sm rounded-md border border-input bg-background/50 px-3 py-1.5 text-sm outline-none focus:border-primary"
            aria-label="Название турнира"
          />
        </div>
        <button
          onClick={resetAll}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" /> Сбросить турнир
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="panel h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xl">
            <Users className="size-5 text-primary" /> Команды ({state.teams.length})
          </h2>

          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTeam(name)}
              placeholder="Название команды"
              className="min-w-0 flex-1 rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => addTeam(name)}
              className="inline-flex items-center rounded-md bg-primary px-3 text-primary-foreground transition-opacity hover:opacity-90"
              aria-label="Добавить команду"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Можно вставить сразу несколько названий через запятую.
          </p>

          <ul className="mt-4 space-y-1.5">
            {state.teams.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm"
              >
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate">{t.name}</span>
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Shuffle className="size-4" /> Сгенерировать плей-офф
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="gc">
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
                className="w-16 rounded-md border border-input bg-background/50 px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={generateGroups}
                disabled={state.teams.length < 2}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary disabled:opacity-40"
              >
                Создать группы
              </button>
            </div>

            <button
              onClick={playoffFromGroups}
              disabled={state.groups.length === 0}
              className="w-full rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary disabled:opacity-40"
            >
              Плей-офф из топ-2 групп
            </button>
          </div>
        </aside>

        <section>
          <div className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1">
            {(
              [
                ["playoff", "Плей-офф", Swords],
                ["groups", "Группы", LayoutGrid],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          {tab === "playoff" ? (
            <BracketView
              matches={state.bracket}
              teams={state.teams}
              onScore={setBracketScore}
            />
          ) : (
            <GroupStage
              groups={state.groups}
              matches={state.groupMatches}
              onScore={setGroupScore}
            />
          )}
        </section>
      </div>
    </main>
  );
}
