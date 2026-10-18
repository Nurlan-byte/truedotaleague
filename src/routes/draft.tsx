import { createFileRoute } from "@tanstack/react-router";
import { DraftApp } from "@/components/DraftApp";

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
  return <DraftApp />;
}
