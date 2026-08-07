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
  const { state, actions } = useTournamentState();
  const { isAdmin } = useAdmin();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-4xl text-foreground">
          <Crown className="size-7 text-accent" /> Турниры лиги
        </h1>
        {isAdmin && state.history.length > 0 && (
          <button
            onClick={() => {
              if (!confirm("Удалить все завершённые турниры? Действие необратимо.")) return;
              actions.clearHistory();
              toast.success("История турниров очищена");
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-semibold text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Очистить все
          </button>
        )}
      </div>

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
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">{t.date}</p>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (!confirm(`Удалить турнир «${t.title}»? Действие необратимо.`)) return;
                        actions.removeTournament(t.id);
                        toast.success(`Турнир «${t.title}» удалён`);
                      }}
                      aria-label={`Удалить турнир ${t.title}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/60 px-2 py-1 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" /> Удалить
                    </button>
                  )}
                </div>
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
