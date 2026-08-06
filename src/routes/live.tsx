import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, LayoutGrid, Radio, Swords } from "lucide-react";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import { MatchSchedule } from "@/components/MatchSchedule";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Турнир онлайн — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Публичная страница турнира: расписание матчей, таблицы групп и сетка плей-офф лиги по Dota 2 в реальном времени.",
      },
      { property: "og:title", content: "Турнир онлайн — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Смотрите расписание, таблицы групп и скобку плей-офф турнира TrueDotaLeague.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const { state, ready, refresh } = useTournamentState();
  const [tab, setTab] = useState<"schedule" | "groups" | "playoff">("schedule");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      refresh();
      setUpdatedAt(new Date().toLocaleTimeString("ru-RU"));
    };
    const timer = window.setInterval(tick, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
          <Radio className="size-4" /> Турнир онлайн
        </p>
        <h1 className="mt-2 text-4xl leading-none text-foreground sm:text-5xl">
          {state.title || "Турнир"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Открытая страница: расписание, таблицы групп и сетка плей-офф. Доступно всем без входа.
          Данные обновляются автоматически каждые 10 секунд
          {updatedAt ? ` — последнее обновление в ${updatedAt}` : ""}.
        </p>
      </header>

      <div className="mb-5 inline-flex flex-wrap rounded-xl border border-border bg-white/70 p-1 backdrop-blur-sm">
        {(
          [
            ["schedule", "Расписание", CalendarDays],
            ["groups", "Группы", LayoutGrid],
            ["playoff", "Плей-офф", Swords],
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

      {!ready ? (
        <div className="panel p-5 text-sm text-muted-foreground">Загружаем турнир…</div>
      ) : tab === "schedule" ? (
        <MatchSchedule
          teams={state.teams}
          groupMatches={state.groupMatches}
          bracket={state.bracket}
        />
      ) : tab === "groups" ? (
        <GroupStage groups={state.groups} matches={state.groupMatches} readOnly />
      ) : (
        <BracketView matches={state.bracket} teams={state.teams} readOnly />
      )}
    </div>
  );
}
