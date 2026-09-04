import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Crown,
  LayoutGrid,
  ListOrdered,
  Medal,
  Search,
  Trophy,
} from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import { MatchSchedule } from "@/components/MatchSchedule";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Архив турниров — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Архив завершённых турниров лиги по Dota 2: итоговые места команд, чемпионы и начисленные TDL points.",
      },
      { property: "og:title", content: "Архив турниров — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Просматривайте результаты всех завершённых турниров TrueDotaLeague.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivePage,
});

const placeColor = (place: number) =>
  place === 1
    ? "text-accent"
    : place === 2
      ? "text-primary"
      : place === 3
        ? "text-win"
        : "text-muted-foreground";

function ArchivePage() {
  const { state, ready } = useTournamentState();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.history;
    return state.history.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.placements.some((p) => p.teamName.toLowerCase().includes(q)),
    );
  }, [state.history, query]);

  const selected = list.find((t) => t.id === selectedId) ?? list[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
          <Archive className="size-4" /> Архив
        </p>
        <h1 className="mt-2 text-4xl leading-none text-foreground sm:text-5xl">Архив турниров</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Все завершённые турниры лиги: итоговые места, чемпионы и начисленные TDL points.
        </p>
      </header>

      {!ready ? (
        <div className="panel p-5 text-sm text-muted-foreground">Загружаем архив…</div>
      ) : state.history.length === 0 ? (
        <div className="panel p-5 text-sm text-muted-foreground">
          Завершённых турниров пока нет. Как только администратор завершит турнир, он появится в
          архиве.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="panel p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по турниру или команде"
                className="w-full rounded-lg border border-border bg-white/70 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>

            <ul className="mt-4 space-y-2">
              {list.length === 0 && (
                <li className="text-sm text-muted-foreground">Ничего не найдено.</li>
              )}
              {list.map((t, i) => {
                const champion = t.placements.find((p) => p.place === 1);
                const active = selected?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-white/60 hover:border-primary/50"
                      }`}
                    >
                      <p className="truncate text-sm font-bold text-foreground">
                        {list.length - i}. {t.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Crown className="size-3.5 text-accent" />
                        {champion?.teamName ?? "—"} · {t.date}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {selected && (
            <section className="panel p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <Trophy className="size-6 text-accent" /> {selected.title}
                </h2>
                <p className="text-xs text-muted-foreground">Завершён {selected.date}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-white/60 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Чемпион</p>
                  <p className="mt-1 truncate font-bold text-foreground">
                    {selected.placements.find((p) => p.place === 1)?.teamName ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-white/60 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Команд</p>
                  <p className="mt-1 font-bold text-foreground">{selected.placements.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-white/60 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Разыграно очков
                  </p>
                  <p className="mt-1 font-bold text-foreground">
                    {selected.placements.reduce((sum, p) => sum + p.points, 0)} TDL
                  </p>
                </div>
              </div>

              <nav className="mt-5 flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                      tab === t.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-white/60 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <t.icon className="size-3.5" /> {t.label}
                  </button>
                ))}
              </nav>

              <div className="mt-4">
                {tab === "results" && (
                  <ul className="space-y-1.5">
                    {selected.placements.map((p) => (
                      <li
                        key={p.place}
                        className="flex items-center gap-2 rounded-lg border border-border bg-white/50 px-3 py-2 text-sm"
                      >
                        <Medal className={`size-4 ${placeColor(p.place)}`} />
                        <span className="w-6 font-bold text-muted-foreground">{p.place}</span>
                        <TeamLogo name={p.teamName} logo={p.logo} />
                        <span className="flex-1 truncate text-foreground">{p.teamName}</span>
                        <span className="font-bold text-foreground">+{p.points} TDL</span>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "bracket" &&
                  (bracket.length > 0 ? (
                    <BracketView matches={bracket} teams={teams} readOnly />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Для этого турнира сетка плей-офф не сохранена.
                    </p>
                  ))}

                {tab === "groups" &&
                  (groups.length > 0 ? (
                    <GroupStage groups={groups} matches={groupMatches} readOnly />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Групповой этап в этом турнире не проводился.
                    </p>
                  ))}

                {tab === "matches" && (
                  <MatchSchedule teams={teams} groupMatches={groupMatches} bracket={bracket} />
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
