import { createFileRoute } from "@tanstack/react-router";
import { RankingView } from "@/components/RankingView";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/rating-teams")({
  head: () => ({
    meta: [
      { title: "Рейтинг команд — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Общий рейтинг команд лиги по Dota 2 в TDL points: титулы, участия и очки за призовые места.",
      },
      { property: "og:title", content: "Рейтинг команд TrueDotaLeague" },
      {
        property: "og:description",
        content: "TDL points команд лиги: 50 за первое место, 25 за второе, 12 за третье, 6 за четвёртое.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RatingTeamsPage,
});

function RatingTeamsPage() {
  const { state } = useTournamentState();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="mb-5 text-4xl text-foreground">Рейтинг команд</h1>
      <RankingView history={state.history} />
    </div>
  );
}
