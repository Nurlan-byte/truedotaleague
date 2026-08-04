import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Участники лиги — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Список участников TrueDotaLeague: никнеймы, рейтинг MMR и роли игроков, зарегистрированных в лиге по Дота 2.",
      },
      { property: "og:title", content: "Участники лиги — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Все зарегистрированные игроки лиги по Дота 2 с MMR и позициями.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayersPage,
});

type Row = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  mmr: number | null;
  role_position: string;
};

function PlayersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("profiles")
      .select("id, nickname, avatar_url, mmr, role_position")
      .order("mmr", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (active) setRows((data as Row[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  const list = (rows ?? []).filter((r) =>
    (r.nickname || "").toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 lg:px-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> К турниру
      </Link>

      <h1 className="flex items-center gap-3 text-4xl leading-none text-foreground sm:text-5xl">
        <Users className="size-7 text-primary" /> Участники
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Игроки, которые зарегистрировались на сайте. Нажмите на карточку, чтобы открыть профиль.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по никнейму…"
        aria-label="Поиск участника"
        className="mt-5 w-full max-w-sm rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
      />

      {rows === null ? (
        <p className="panel mt-6 p-5 text-sm text-muted-foreground">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="panel mt-6 p-5 text-sm text-muted-foreground">
          Пока никого нет. Станьте первым участником лиги!
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                to="/players/$playerId"
                params={{ playerId: p.id }}
                className="panel flex items-center gap-3 p-4 transition-transform hover:scale-[1.02]"
              >
                <TeamLogo name={p.nickname || "?"} logo={p.avatar_url ?? undefined} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {p.nickname || "Без ника"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.mmr !== null ? `${p.mmr} MMR` : "MMR не указан"}
                    {p.role_position ? ` · ${p.role_position}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
