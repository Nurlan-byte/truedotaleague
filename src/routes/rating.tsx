import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { LoadingPanel } from "@/components/league";
import { LeaderboardTable } from "@/components/home/Leaderboard";
import { catalogQuery, rankingQuery } from "@/lib/league-api";

export const Route = createFileRoute("/rating")({
  head: () => ({
    meta: [
      { title: "Рейтинг команд TDL Points — TrueDotaLeague" },
      { name: "description", content: "Полный рейтинг команд TrueDotaLeague по TDL Points: победы, поражения и сыгранные турниры." },
      { property: "og:title", content: "Рейтинг команд TrueDotaLeague" },
      { property: "og:description", content: "Таблица команд лиги по TDL Points, разыгрываемым в TDL Freedom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://truedotaleague.kz/rating" }],
  }),
  component: RatingPage,
});

function RatingPage() {
  const ranking = useQuery(rankingQuery());
  const catalog = useQuery(catalogQuery());
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Leaderboard</p>
      <h1 className="mt-1 flex items-center gap-2 text-3xl text-foreground sm:text-4xl">
        <BarChart3 className="size-7 text-primary" /> Рейтинг TDL Points
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Разыгрывается в TDL Freedom. 1 место — 50, 2 — 25, 3 — 12, 4 — 6 очков.</p>
      <div className="mt-6">
        {ranking.isLoading ? (
          <LoadingPanel text="Загружаем рейтинг…" />
        ) : ranking.error ? (
          <LoadingPanel text="Не удалось загрузить рейтинг. Обновите страницу." />
        ) : (
          <LeaderboardTable rows={ranking.data ?? []} catalog={catalog.data ?? []} />
        )}
      </div>
    </div>
  );
}
