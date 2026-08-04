import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/players/$playerId")({
  head: () => ({
    meta: [
      { title: "Профиль участника — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Публичный профиль участника TrueDotaLeague: никнейм, рейтинг MMR, роль на линии и описание игрока.",
      },
      { property: "og:title", content: "Профиль участника — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Никнейм, MMR, позиция и описание игрока лиги по Дота 2.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerPage,
});

type Row = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  mmr: number | null;
  role_position: string;
  bio: string;
  profile_url: string;
};

function PlayerPage() {
  const { playerId } = Route.useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("profiles")
      .select("id, nickname, avatar_url, mmr, role_position, bio, profile_url")
      .eq("id", playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setRow(data as Row);
        else setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [playerId]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 lg:px-8">
      <Link
        to="/players"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Все участники
      </Link>

      {notFound ? (
        <p className="panel p-5 text-sm text-muted-foreground">Игрок не найден.</p>
      ) : !row ? (
        <p className="panel p-5 text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <div className="panel space-y-5 p-6">
          <div className="flex items-center gap-4">
            <TeamLogo name={row.nickname || "?"} logo={row.avatar_url ?? undefined} size="lg" />
            <div>
              <h1 className="text-3xl leading-none text-foreground sm:text-4xl">
                {row.nickname || "Без ника"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.mmr !== null ? `${row.mmr} MMR` : "MMR не указан"}
                {row.role_position ? ` · ${row.role_position}` : ""}
              </p>
            </div>
          </div>

          {row.bio && (
            <p className="whitespace-pre-line text-sm text-foreground">{row.bio}</p>
          )}

          {row.profile_url && (
            <a
              href={row.profile_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <ExternalLink className="size-4" /> Профиль Steam / Dotabuff
            </a>
          )}
        </div>
      )}
    </main>
  );
}
