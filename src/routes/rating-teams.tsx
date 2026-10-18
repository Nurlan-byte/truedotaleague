import { createFileRoute, Link } from "@tanstack/react-router";
import { RankingView } from "@/components/RankingView";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { rankingQuery } from "@/lib/league-api";

export const Route = createFileRoute("/rating-teams")({
  head: () => ({
    meta: [
      { title: "Рейтинг команд - TrueDotaLeague" },
      {
        name: "description",
        content:
          "Общий рейтинг команд лиги по Dota 2 и TDL points: очки, титулы и участие в официальных матчах.",
      },
      { property: "og:title", content: "Рейтинг команд TrueDotaLeague" },
      {
        property: "og:description",
        content:
          "TDL points лучших команд: 50 за первое место, 25 за второе, 12 за третье, 6 за четвёртое.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RatingTeamsPage,
});

function RatingTeamsPage() {
  const { data, isLoading, isError, refetch } = useQuery(rankingQuery());
  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10 lg:px-8">
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-white/70 px-5 py-7 shadow-[var(--shadow-panel)] backdrop-blur-md sm:px-8 sm:py-9">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border-[30px] border-primary/10"
          aria-hidden="true"
        />
        <div className="relative animate-slide">
          <nav aria-label="Навигационная цепочка" className="mb-5 text-xs text-muted-foreground">
            <Link to="/" className="rounded text-primary hover:underline">
              Главная
            </Link>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page">Рейтинг команд</span>
          </nav>
          <p className="label-xs text-primary">Киберспорт TDL</p>
          <h1 className="mt-1 flex items-center gap-3 text-4xl text-foreground sm:text-5xl">
            <Trophy className="size-8 text-accent sm:size-10" aria-hidden="true" /> Рейтинг команд
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Результаты турниров, титулы и очки команд TrueDotaLeague.
          </p>
        </div>
      </div>
      {isLoading ? (
        <div className="panel overflow-hidden" role="status" aria-label="Загрузка рейтинга команд">
          <div className="border-b border-border px-5 py-5">
            <div className="h-6 w-44 animate-pulse rounded-md bg-primary/10" />
            <div className="mt-5 h-10 w-full max-w-sm animate-pulse rounded-md bg-primary/10" />
          </div>
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 border-b border-border/60 px-5 py-4 last:border-0"
              >
                <div className="size-8 animate-pulse rounded-full bg-primary/10" />
                <div className="h-4 w-36 animate-pulse rounded bg-primary/10" />
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-primary/10" />
              </div>
            ))}
          </div>
          <span className="sr-only">Загружаем рейтинг команд</span>
        </div>
      ) : isError ? (
        <div className="panel p-6" role="alert">
          <h2 className="text-xl text-foreground">Не удалось загрузить рейтинг</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Попробуйте ещё раз через несколько секунд.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
          >
            Повторить
          </button>
        </div>
      ) : (
        <RankingView rows={data ?? []} />
      )}
    </main>
  );
}
