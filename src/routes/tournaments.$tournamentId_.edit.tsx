import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";
import { LoadingPanel } from "@/components/league";
import { TournamentEditor } from "@/components/TournamentEditor";
import { tournamentQuery } from "@/lib/league-api";

export const Route = createFileRoute("/tournaments/$tournamentId_/edit")({
  head: () => ({
    meta: [
      { title: "Редактирование турнира — TrueDotaLeague" },
      { name: "description", content: "Редактирование турнира лиги TrueDotaLeague." },
      { property: "og:title", content: "Редактирование турнира — TrueDotaLeague" },
      { property: "og:description", content: "Раздел администраторов лиги." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditTournamentPage,
});

function EditTournamentPage() {
  const { tournamentId } = Route.useParams();
  const { isAdmin, checking } = useAdmin();
  const { data, isLoading } = useQuery({ ...tournamentQuery(tournamentId), enabled: isAdmin });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <h1 className="mb-5 flex items-center gap-2 text-4xl text-foreground">
        <Pencil className="size-7 text-primary" /> Редактирование турнира
      </h1>
      {checking || (isAdmin && isLoading) ? (
        <LoadingPanel />
      ) : !isAdmin ? (
        <LoadingPanel text="Редактировать турниры могут только администраторы лиги." />
      ) : !data ? (
        <LoadingPanel text="Турнир не найден." />
      ) : (
        <TournamentEditor key={data.id} tournament={data} />
      )}
      <Link to="/tournaments/$tournamentId" params={{ tournamentId }} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
        ← К турниру
      </Link>
    </div>
  );
}
