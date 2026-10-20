import { createFileRoute } from "@tanstack/react-router";
import { MyTeamPage } from "@/components/MyTeamPage";
export const Route = createFileRoute("/my-team")({
  head: () => ({
    meta: [
      { title: "Моя команда — создание состава | TrueDotaLeague" },
      {
        name: "description",
        content:
          "Создайте свою команду по Dota 2: название, тег, логотип и состав, затем подайте заявку на турнир лиги.",
      },
      { property: "og:title", content: "Моя команда — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Создание команды и заявки на турниры лиги по Dota 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyTeamPage,
});
