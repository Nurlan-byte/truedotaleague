import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { seoUrl } from "@/lib/seo";
import { catalogQuery } from "@/lib/league-api";
import { formatLeagueDate, sortCatalog } from "@/lib/league";
import { LoadingPanel } from "@/components/league";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/champions")({
  head: () => ({
    meta: [
      { title: "Зал славы — чемпионы TrueDotaLeague" },
      { name: "description", content: "Музей кубков TrueDotaLeague: все чемпионы турниров Dota 2 в Казахстане, призёры и TDL Points." },
      { property: "og:title", content: "Зал славы TrueDotaLeague" },
      { property: "og:description", content: "Кубки и победители турниров лиги по Dota 2." },
      { property: "og:type", content: "website" },
      ...seoUrl("/champions").meta,
      { name: "twitter:card", content: "summary" },
    ],
    links: seoUrl("/champions").links,
  }),
  component: ChampionsPage,
});

const gold = { backgroundImage: "var(--gold-gradient)" } as const;

function ChampionsPage() {
  const { data, isLoading } = useQuery(catalogQuery());
  const finished = useMemo(() => sortCatalog((data ?? []).filter((t) => t.status === "finished")), [data]);
  const titles = useMemo(() => {
    const m = new Map<string, { name: string; logo: string | null; count: number }>();
    for (const t of finished) {
      const w = t.placements.find((p) => p.place === 1);
      if (!w) continue;
      const logo = t.tournament_participants.find((p) => p.team_id === w.team_id)?.logo_url ?? null;
      const cur = m.get(w.team_id) ?? { name: w.team_name, logo, count: 0 };
      cur.count++; m.set(w.team_id, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [finished]);

  return (
    <div className="min-h-full" style={{ background: "var(--museum)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
        <header className="text-center">
          <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full shadow-[0_0_60px_-5px_var(--gold)]" style={gold}>
            <Trophy className="size-10 text-gold-foreground" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-gold">TrueDotaLeague Museum</p>
          <h1 className="mt-2 bg-clip-text text-4xl font-extrabold text-transparent sm:text-6xl" style={gold}>Зал славы</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gold-soft/70">Здесь хранятся кубки всех турниров лиги и имена команд, которые их подняли.</p>
        </header>

        {isLoading ? <div className="mt-10"><LoadingPanel /></div> : !finished.length ? (
          <p className="mt-16 text-center text-gold-soft/70">Витрины пока пусты — первый кубок ждёт своего чемпиона.</p>
        ) : (
          <>
            {titles.length > 0 && (
              <section className="mt-12">
                <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-[0.3em] text-gold">Больше всего титулов</h2>
                <div className="flex flex-wrap justify-center gap-3">
                  {titles.slice(0, 6).map(([id, t]) => (
                    <Link key={id} to="/teams/$teamId" params={{ teamId: id }} className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-gold-soft transition hover:bg-gold/20">
                      <TeamLogo name={t.name} logo={t.logo ?? undefined} size="md" />
                      <span className="font-bold">{t.name}</span>
                      <span className="flex items-center gap-0.5 text-gold">{Array.from({ length: Math.min(t.count, 5) }, (_, i) => <Trophy key={i} className="size-4" />)}{t.count > 5 && `×${t.count}`}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {finished.map((t) => {
                const pl = [...t.placements].sort((a, b) => a.place - b.place);
                const w = pl.find((p) => p.place === 1);
                const logo = w ? t.tournament_participants.find((p) => p.team_id === w.team_id)?.logo_url ?? null : null;
                return (
                  <article key={t.id} className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-gold/30 bg-gold/5 p-6 text-center transition hover:-translate-y-1 hover:border-gold/70 hover:shadow-[0_20px_60px_-20px_var(--gold)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,var(--gold)_0%,transparent_70%)] opacity-25" />
                    <div className="relative flex size-24 items-center justify-center rounded-full shadow-[0_0_40px_-8px_var(--gold)]" style={gold}>
                      <Trophy className="size-12 text-gold-foreground" />
                    </div>
                    <div className="relative mt-1 h-2 w-20 rounded-b-md" style={gold} />
                    <p className="mt-4 text-xs uppercase tracking-widest text-gold/80">{t.starts_at ? formatLeagueDate(t.starts_at) : "Турнир"}</p>
                    <Link to="/tournaments/$tournamentId" params={{ tournamentId: t.id }} className="mt-1 text-lg font-bold text-gold-soft hover:underline">{t.title}</Link>
                    {w ? (
                      <Link to="/teams/$teamId" params={{ teamId: w.team_id }} className="mt-4 flex items-center gap-2 rounded-full bg-gold/15 px-4 py-2">
                        <Crown className="size-4 text-gold" />
                        <TeamLogo name={w.team_name} logo={logo ?? undefined} size="md" />
                        <span className="font-extrabold text-gold">{w.team_name}</span>
                      </Link>
                    ) : <p className="mt-4 text-sm text-gold-soft/60">Чемпион не указан</p>}
                    {pl.length > 1 && (
                      <ul className="mt-4 w-full space-y-1 border-t border-gold/20 pt-3 text-sm text-gold-soft/80">
                        {pl.filter((p) => p.place === 2 || p.place === 3).map((p) => (
                          <li key={p.team_id} className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5"><Medal className="size-4 text-gold/70" />{p.place} место · {p.team_name}</span>
                            {p.points > 0 && <span className="text-xs text-gold/70">+{p.points} TDL</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </section>
            <p className="mt-10 text-center text-sm"><Link to="/archive" className="text-gold underline-offset-4 hover:underline">Полный архив с сетками →</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
