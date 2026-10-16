import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { LoadingPanel, SafeMarkdown } from "@/components/league";
import { regulationQuery } from "@/lib/league-api";
import { formatLeagueDate } from "@/lib/league";

export const Route = createFileRoute("/regulations")({
  head: () => ({
    meta: [
      { title: "Регламент лиги — TrueDotaLeague" },
      { name: "description", content: "Официальный регламент турниров лиги TrueDotaLeague по Dota 2." },
      { property: "og:title", content: "Регламент TrueDotaLeague" },
      { property: "og:description", content: "Правила участия команд в турнирах лиги по Dota 2." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegulationsPage,
});

function RegulationsPage() {
  const { data, isLoading, error } = useQuery(regulationQuery());
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <BookOpen className="size-7 text-primary" /> Регламент
      </h1>
      <div className="mt-5">
        {isLoading ? (
          <LoadingPanel />
        ) : error ? (
          <LoadingPanel text="Не удалось загрузить регламент. Обновите страницу." />
        ) : !data ? (
          <LoadingPanel text="Регламент ещё не опубликован." />
        ) : (
          <article className="panel p-5">
            <p className="mb-4 text-xs text-muted-foreground">
              Опубликован: {formatLeagueDate(data.published_at) ?? "—"}
              {data.effective_from && ` · действует с ${formatLeagueDate(data.effective_from)}`}
            </p>
            <SafeMarkdown body={data.body} />
          </article>
        )}
      </div>
    </div>
  );
}
