import { createFileRoute } from "@tanstack/react-router";
import { Crown, Medal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TeamLogo } from "@/components/TeamLogo";
import { useAdmin } from "@/hooks/use-admin";
import { useTournamentState } from "@/hooks/use-tournament-state";


export const Route = createFileRoute("/tournaments")({
  head: () => ({
    meta: [
      { title: "Турниры лиги — TrueDotaLeague" },
      {
        name: "description",
        content:
          "История турниров лиги по Dota 2: чемпионы каждого сезона, призовые места и начисленные TDL points.",
      },
      { property: "og:title", content: "Турниры и чемпионы TrueDotaLeague" },
      {
        property: "og:description",
        content: "Все прошедшие турниры лиги, победители и распределение TDL points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TournamentsPage,
});

const placeColor = (place: number) =>
  place === 1
    ? "text-accent"
    : place === 2
      ? "text-primary"
      : place === 3
        ? "text-win"
        : "text-muted-foreground";

function TournamentsPage() {
  const { state } = useTournamentState();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Crown className="size-7 text-accent" /> Турниры лиги
      </h1>

      {state.history.length === 0 ? (
        <div className="panel mt-5 p-5 text-sm text-muted-foreground">
          Завершённых турниров пока нет. После финала администратор нажимает «Завершить турнир» — и
          он появится здесь.
        </div>
      ) : (
        <ol className="mt-5 space-y-4">
          {state.history.map((t, i) => (
            <li key={t.id} className="panel p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xl font-bold text-foreground">
                  {state.history.length - i}-й турнир — {t.title}
                </p>
                <p className="text-xs text-muted-foreground">{t.date}</p>
              </div>
              <ul className="space-y-1.5">
                {t.placements.map((p) => (
                  <li key={p.place} className="flex items-center gap-2 text-sm">
                    <Medal className={`size-4 ${placeColor(p.place)}`} />
                    <span className="w-6 font-bold text-muted-foreground">{p.place}</span>
                    <TeamLogo name={p.teamName} logo={p.logo} />
                    <span className="flex-1 truncate text-foreground">{p.teamName}</span>
                    <span className="font-bold text-foreground">+{p.points} TDL</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
