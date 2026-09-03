import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, Lock, Shuffle, Swords, Trash2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import { useAdmin } from "@/hooks/use-admin";
import { useTournamentState } from "@/hooks/use-tournament-state";
import { shuffle } from "@/lib/tournament";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Создать турнир — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Панель организатора лиги: групповой этап, таблицы и сетка плей-офф с автоматическим продвижением победителей.",
      },
      { property: "og:title", content: "Создать турнир — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Групповой этап, таблицы и сетка плей-офф онлайн для лиги по Dota 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateTournamentPage,
});

function CreateTournamentPage() {
  const { isAdmin, checking, user } = useAdmin();
  const { state, actions, placements } = useTournamentState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"groups" | "playoff">("playoff");

  if (checking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6 text-sm text-muted-foreground">Проверяем доступ…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6">
          <h1 className="flex items-center gap-2 text-3xl text-foreground">
            <Lock className="size-6 text-primary" /> Создание турниров — только для админов
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Сетки и групповые этапы создают администраторы лиги. Вы можете смотреть турниры,
            рейтинги команд и игроков в меню слева.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/tournaments"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
            >
              Смотреть турниры
            </Link>
            {!user && (
              <Link
                to="/auth"
                className="rounded-lg border border-border bg-white/60 px-4 py-2 text-sm font-semibold text-foreground"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-4xl leading-none text-foreground sm:text-5xl">Создать турнир</h1>
        <input
          value={state.title}
          onChange={(e) => actions.setTitle(e.target.value)}
          className="mt-3 w-full max-w-sm rounded-lg border border-input bg-white/70 px-3 py-1.5 text-sm text-foreground outline-none backdrop-blur-sm focus:border-primary focus:bg-white"
          aria-label="Название турнира"
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="panel h-fit space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl text-foreground">
              <Users className="size-5 text-primary" /> Команды ({state.teams.length})
            </h2>
            <Link to="/teams" className="text-xs font-semibold text-primary hover:underline">
              Управлять
            </Link>
          </div>

          {state.teams.length < 2 && (
            <p className="rounded-lg border border-border bg-white/60 p-3 text-xs text-muted-foreground">
              Сначала добавьте официальные команды в разделе{" "}
              <Link to="/teams" className="font-semibold text-primary hover:underline">
                Команды
              </Link>{" "}
              — минимум две. Только после этого можно создать группы и сетку плей-офф.
            </p>
          )}

          <button
            onClick={() => actions.generateBracket(shuffle(state.teams))}
            disabled={state.teams.length < 2}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-40"
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
              onChange={(e) => actions.setGroupCount(Number(e.target.value) || 1)}
              className="w-16 rounded-lg border border-input bg-white/70 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={actions.generateGroups}
              disabled={state.teams.length < 2}
              className="flex-1 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Создать группы
            </button>
          </div>

          <button
            onClick={actions.playoffFromGroups}
            disabled={state.groups.length === 0}
            className="w-full rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-medium text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
          >
            Плей-офф из топ-2 групп
          </button>


          <button
            onClick={() => {
              if (placements.length === 0) {
                toast.error("Турнир ещё не завершён", {
                  description:
                    "Внесите счёт финала в плей-офф или результаты матчей группового этапа — тогда определятся места и TDL points.",
                });
                return;
              }
              actions.finishTournament();
              toast.success(`Турнир «${state.title}» сохранён`, {
                description: `Чемпион: ${placements[0].teamName}. TDL points начислены.`,
              });
              navigate({ to: "/tournaments" });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-accent-foreground shadow-sm"
          >
            <Trophy className="size-4" /> Завершить турнир
          </button>
          <p className="text-xs text-muted-foreground">
            TDL points: 1 место — 50, 2 — 25, 3 — 12, 4 — 6.
          </p>

          <button
            onClick={actions.reset}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Сбросить турнир
          </button>
        </aside>

        <section>
          <div className="mb-5 inline-flex flex-wrap rounded-xl border border-border bg-white/70 p-1 backdrop-blur-sm">
            {(
              [
                ["playoff", "Плей-офф", Swords],
                ["groups", "Группы", LayoutGrid],
                ["schedule", "Расписание", CalendarDays],
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

          {tab === "playoff" ? (
            <BracketView
              matches={state.bracket}
              teams={state.teams}
              onScore={actions.setBracketScore}
            />
          ) : tab === "groups" ? (
            <GroupStage
              groups={state.groups}
              matches={state.groupMatches}
              onScore={actions.setGroupScore}
            />
          ) : (
            <MatchSchedule
              teams={state.teams}
              groupMatches={state.groupMatches}
              bracket={state.bracket}
              onTime={actions.setMatchTime}
            />
          )}
        </section>

      </div>
    </div>
  );
}
