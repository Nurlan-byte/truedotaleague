import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { LoadingPanel } from "@/components/league";
import { TournamentEditor } from "@/components/TournamentEditor";

export const Route = createFileRoute("/tournaments/new")({
  head: () => ({
    meta: [
      { title: "Новый турнир — TrueDotaLeague" },
      {
        name: "description",
        content: "Создание турнира лиги TrueDotaLeague (только для администраторов).",
      },
      { property: "og:title", content: "Новый турнир — TrueDotaLeague" },
      { property: "og:description", content: "Раздел администраторов лиги для создания турниров." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewTournamentPage,
});

function NewTournamentPage() {
  const { isAdmin, checking } = useAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <h1 className="mb-5 flex items-center gap-2 text-4xl text-foreground">
        <Plus className="size-7 text-primary" /> Новый турнир
      </h1>
      {checking ? (
        <LoadingPanel text="Проверяем доступ…" />
      ) : !isAdmin ? (
        <>
          <LoadingPanel text="Создавать турниры могут только администраторы лиги." />
          <Link
            to="/tournaments"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            ← Все турниры
          </Link>
        </>
      ) : (
        <TournamentEditor />
      )}
    </div>
  );
}
