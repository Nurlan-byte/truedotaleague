import { createFileRoute, Link } from "@tanstack/react-router";
import { Route as RouteIcon } from "lucide-react";
import { leaderboard } from "@/lib/tournament";
import { TeamLogo } from "@/components/TeamLogo";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/road-to-ti")({
  head: () => ({
    meta: [
      { title: "Дорога к TI — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Путь команд лиги к The International: сумма TDL points за сезон, лидеры гонки и правила отбора.",
      },
      { property: "og:title", content: "Дорога к TI — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Гонка команд лиги за слот на The International по сумме TDL points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadToTiPage,
});

const SLOTS = 4;

function RoadToTiPage() {
  const { state } = useTournamentState();
  const rows = leaderboard(state.history);
  const max = rows[0]?.points ?? 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <RouteIcon className="size-7 text-primary" /> Дорога к TI
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Каждый турнир лиги приносит TDL points: 50 за 1 место, 25 за 2, 12 за 3 и 6 за 4. Топ-
        {SLOTS} команд сезона по сумме очков проходят в финальный этап — Дорогу к The International.
      </p>

      {rows.length === 0 ? (
        <div className="panel mt-6 p-5 text-sm text-muted-foreground">
          Гонка ещё не началась — нет завершённых турниров. Загляните в{" "}
          <Link to="/tournaments" className="font-semibold text-primary hover:underline">
            раздел турниров
          </Link>
          .
        </div>
      ) : (
        <ol className="panel mt-6 space-y-2 p-4">
          {rows.map((r, i) => (
            <li
              key={r.teamName}
              className={`rounded-lg px-3 py-2.5 ${
                i < SLOTS ? "bg-primary/10" : "bg-white/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-sm font-bold text-muted-foreground">{i + 1}</span>
                <TeamLogo name={r.teamName} logo={r.logo} size="md" />
                <span className="flex-1 truncate font-medium text-foreground">{r.teamName}</span>
                <span className="text-sm font-bold text-foreground">{r.points} TDL</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
                <div
                  className={i < SLOTS ? "h-full bg-primary" : "h-full bg-muted-foreground/40"}
                  style={{ width: `${Math.max(4, (r.points / max) * 100)}%` }}
                />
              </div>
              {i === SLOTS - 1 && (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  — линия отбора —
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
