import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Shield } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { allTeamsQuery } from "@/lib/league-api";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Команды лиги — TrueDotaLeague" },
      { name: "description", content: "Все команды лиги TrueDotaLeague по Dota 2 и их составы." },
      { property: "og:title", content: "Команды TrueDotaLeague" },
      { property: "og:description", content: "Команды лиги по Dota 2: теги, логотипы и составы игроков." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamsPage,
});

function TeamsPage() {
  const { data, isLoading, error } = useQuery(allTeamsQuery());
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data ?? []).filter((t) => !n || t.name.toLowerCase().includes(n) || t.tag.toLowerCase().includes(n));
  }, [data, q]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl text-foreground sm:text-4xl">
          <Shield className="size-7 text-primary" /> Команды ({data?.length ?? 0})
        </h1>
        <Link
          to="/my-team"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
        >
          Моя команда
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Хотите вступить в команду? Попросите её капитана прислать вам ссылку-приглашение — он найдёт её в разделе{" "}
        <Link to="/my-team" className="font-semibold text-primary hover:underline">«Моя команда»</Link>. Покинуть команду можно там же.
      </p>
      <label className="relative mt-5 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию или тегу"
          className="w-full rounded-lg border border-input bg-white/70 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
        />
      </label>
      <div className="mt-5">
        {isLoading ? (
          <LoadingPanel />
        ) : error ? (
          <LoadingPanel text="Не удалось загрузить команды." />
        ) : list.length === 0 ? (
          <LoadingPanel text={q ? "Ничего не найдено." : "Команд пока нет — создайте первую в разделе «Моя команда»."} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((t) => {
              const members = [...t.team_members].sort((a, b) => a.position - b.position);
              return (
                <li key={t.id} className="panel min-w-0 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamLogo name={t.name} logo={t.logo_url ?? undefined} size="md" />
                    <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      {t.name}
                      {t.tag && <span className="ml-2 text-xs font-semibold uppercase text-primary">[{t.tag}]</span>}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-xs text-muted-foreground">
                    {members.length === 0 && "Состав не указан"}
                    {members.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && <span className="mr-1">·</span>}
                        {m.profile_id ? (
                          <Link
                            to="/players/$playerId"
                            params={{ playerId: m.profile_id }}
                            className="font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                          >
                            {m.nickname}
                          </Link>
                        ) : (
                          m.nickname
                        )}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
