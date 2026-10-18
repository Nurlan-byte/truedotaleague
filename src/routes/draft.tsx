import { createFileRoute } from "@tanstack/react-router";
import { DraftApp } from "@/components/DraftApp";
import { DraftPublished } from "@/components/DraftPublished";
import { useAdmin } from "@/hooks/use-admin";

export const Route = createFileRoute("/draft")({
  head: () => ({
    meta: [
      { title: "Immortal Draft — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Драфт игроков Immortal Draft: капитаны по очереди выбирают игроков в составы. Змейка, таймер, экспорт результатов.",
      },
      { property: "og:title", content: "Immortal Draft — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Драфт игроков Immortal Draft: капитаны по очереди выбирают игроков в составы.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DraftPage,
});

function DraftPage() {
  const { isAdmin, checking } = useAdmin();
  if (checking) {
    return (
      <main className="mx-auto max-w-6xl p-6" role="status">
        Проверяем доступ к драфту…
      </main>
    );
  }
  return isAdmin ? <DraftApp /> : <DraftPublished />;
}
