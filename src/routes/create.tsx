import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useAdmin } from "@/hooks/use-admin";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Создать турнир — TrueDotaLeague" },
      { name: "description", content: "Создание нового турнира лиги TrueDotaLeague (только для администраторов)." },
      { property: "og:title", content: "Создать турнир — TrueDotaLeague" },
      { property: "og:description", content: "Раздел администраторов лиги для создания турниров." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const { isAdmin, checking } = useAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Plus className="size-7 text-primary" /> Создать турнир
      </h1>
      <div className="panel mt-5 p-5 text-sm text-muted-foreground">
        {checking
          ? "Проверяем доступ…"
          : !isAdmin
            ? "Создавать турниры могут только администраторы лиги."
            : "Форма создания турнира скоро появится здесь. Пока турниры, сетки и результаты ведутся только через базу лиги."}
      </div>
      <Link to="/tournaments" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
        ← Все турниры
      </Link>
    </div>
  );
}
