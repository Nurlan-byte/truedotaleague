import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, CalendarClock, Check, Crown, Gamepad2, Medal, MessageCircle, Plus, Shield, Swords, Trophy, Users, UserRound,
} from "lucide-react";
import tdlLogo from "@/assets/tdl-logo.png.asset.json";
import { TeamLogo } from "@/components/TeamLogo";
import { LeaderboardTable } from "@/components/home/Leaderboard";
import { useAdmin } from "@/hooks/use-admin";
import { catalogQuery, platformStatsQuery, rankingQuery, type CatalogItem } from "@/lib/league-api";
import { FORMAT_LABEL, STATUS_LABEL, formatLeagueDate, formatPrize } from "@/lib/league";
import { DIVISIONS, divisionOf, mmrLimitText } from "@/lib/divisions";

const DISCORD_URL = "https://discord.gg/ZJBzeKcjvU";
const TITLE = "TrueDotaLeague — турниры по Dota 2 в Казахстане";
const DESC =
  "Соревновательная платформа по Dota 2 в Казахстане: три дивизиона, регулярные турниры, регистрация команд и рейтинг TDL Points.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://truedotaleague.kz/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://truedotaleague.kz/" }],
  }),
  component: HomePage,
});

const UPCOMING = ["registration_open", "announced", "registration_closed", "live"] as const;

function pickNext(list: CatalogItem[]): CatalogItem | null {
  const items = list.filter((t) => (UPCOMING as readonly string[]).includes(t.status));
  const rank = (s: string) => (s === "registration_open" ? 0 : s === "live" ? 1 : s === "announced" ? 2 : 3);
  items.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (a.starts_at ? new Date(a.starts_at).getTime() : Infinity) - (b.starts_at ? new Date(b.starts_at).getTime() : Infinity),
  );
  return items[0] ?? null;
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-2xl text-foreground sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const linkMore = "inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline";

function HomePage() {
  const { isAdmin } = useAdmin();
  const catalog = useQuery(catalogQuery());
  const ranking = useQuery(rankingQuery());
  const stats = useQuery(platformStatsQuery());
  const list = catalog.data ?? [];
  const next = pickNext(list);
  const champions = list
    .filter((t) => t.status === "finished")
    .sort((a, b) => new Date(b.starts_at ?? b.created_at).getTime() - new Date(a.starts_at ?? a.created_at).getTime())
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-6 sm:py-10 lg:px-8">
      {/* HERO */}
      <section className="bg-hero relative overflow-hidden rounded-[2rem] px-6 py-12 text-navy-foreground sm:px-12 sm:py-20 animate-rise">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-sky/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 size-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-sky">TrueDotaLeague</p>
            <h1 className="mt-4 text-4xl leading-[1.05] sm:text-6xl lg:text-7xl">От любителя до чемпиона</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed opacity-90 sm:text-lg">
              TrueDotaLeague — соревновательная платформа по Dota 2 в Казахстане. Участвуй в регулярных турнирах,
              собирай команду, зарабатывай TDL Points и докажи своё мастерство.
            </p>
            <p className="mt-3 text-sm font-semibold text-sky">Три дивизиона. Тысячи возможностей. Один путь к чемпионству.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/tournaments" className="inline-flex items-center justify-center gap-2 rounded-full bg-navy-foreground px-6 py-3 text-sm font-bold text-navy shadow-lg transition-transform hover:scale-[1.03] active:scale-95">
                <Trophy className="size-4" /> Смотреть турниры
              </Link>
              <Link to="/my-team" className="inline-flex items-center justify-center gap-2 rounded-full border border-navy-foreground/40 px-6 py-3 text-sm font-bold text-navy-foreground transition-colors hover:bg-navy-foreground/10">
                <Users className="size-4" /> Зарегистрировать команду
              </Link>
              {isAdmin && (
                <Link to="/tournaments/new" className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground shadow-lg">
                  <Plus className="size-4" /> Создать турнир
                </Link>
              )}
            </div>
          </div>
          <img src={tdlLogo.url} alt="Логотип TrueDotaLeague" width={220} height={220} className="mx-auto hidden size-56 rounded-[2.5rem] shadow-2xl lg:block" />
        </div>
      </section>

      {/* STATS */}
      <section aria-label="Статистика платформы" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Проведено турниров", value: stats.data?.tournaments, icon: Trophy },
          { label: "Зарегистрировано команд", value: stats.data?.teams, icon: Shield },
          { label: "Зарегистрировано игроков", value: stats.data?.players, icon: UserRound },
          { label: "Сыграно матчей", value: stats.data?.matches, icon: Swords },
        ].map((c) => (
          <div key={c.label} className="card-lift rounded-2xl border border-border bg-card p-4 sm:p-5">
            <c.icon className="size-5 text-primary" />
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{c.value ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </section>

      {/* DIVISIONS */}
      <section>
        <SectionHead eyebrow="Дивизионы" title="Три дивизиона TDL" />
        <div className="grid gap-4 md:grid-cols-3">
          {DIVISIONS.map((d, i) => (
            <Link
              key={d.id}
              to="/tournaments"
              search={{ division: d.id }}
              className="card-lift group flex flex-col rounded-3xl border border-border bg-card p-6 hover:border-primary"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                {i === 0 ? <Gamepad2 className="size-5" /> : i === 1 ? <Medal className="size-5" /> : <Crown className="size-5" />}
              </span>
              <h3 className="mt-4 text-2xl text-foreground">{d.name}</h3>
              <p className="text-sm text-muted-foreground">{d.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-foreground">
                {d.points.map((p) => (
                  <li key={p} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{p}</li>
                ))}
              </ul>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">
                Турниры дивизиона <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* NEXT TOURNAMENT */}
      <section>
        <SectionHead eyebrow="Next tournament" title="Ближайший турнир" action={<Link to="/tournaments" className={linkMore}>Все <ArrowRight className="size-4" /></Link>} />
        {catalog.isLoading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-muted" />
        ) : !next ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <CalendarClock className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-semibold text-foreground">Новых турниров пока нет</p>
            <p className="mt-1 text-sm text-muted-foreground">Следите за анонсами в Discord — скоро здесь появится следующий турнир.</p>
          </div>
        ) : (
          <NextTournament t={next} />
        )}
      </section>

      {/* LEADERBOARD */}
      <section>
        <SectionHead
          eyebrow="Leaderboard"
          title="Рейтинг TDL"
          action={<Link to="/rating" className={linkMore}>Полный рейтинг <ArrowRight className="size-4" /></Link>}
        />
        <p className="-mt-3 mb-4 text-sm text-muted-foreground">TDL Points разыгрываются в TDL Freedom.</p>
        {ranking.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : <LeaderboardTable rows={ranking.data ?? []} catalog={list} limit={10} />}
      </section>

      {/* HALL OF CHAMPIONS */}
      <section>
        <SectionHead eyebrow="Hall of champions" title="История чемпионов" action={<Link to="/archive" className={linkMore}>Архив <ArrowRight className="size-4" /></Link>} />
        {champions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Завершённых турниров пока нет — первый чемпион появится здесь после финала.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {champions.map((t) => <ChampionCard key={t.id} t={t} />)}
          </ul>
        )}
      </section>

      {/* DISCORD */}
      <section className="bg-hero relative overflow-hidden rounded-[2rem] px-6 py-10 text-navy-foreground sm:px-12">
        <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <MessageCircle className="size-8 text-sky" />
            <h2 className="mt-3 text-2xl sm:text-3xl">Присоединяйся к сообществу TrueDotaLeague</h2>
            <p className="mt-2 max-w-2xl text-sm opacity-90 sm:text-base">
              Находи тиммейтов, следи за анонсами турниров, общайся с игроками и участвуй в жизни лиги.
            </p>
          </div>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-navy-foreground px-6 py-3 text-sm font-bold text-navy shadow-lg transition-transform hover:scale-[1.03]">
            Открыть Discord <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </div>
  );
}

function NextTournament({ t }: { t: CatalogItem }) {
  const div = divisionOf(t.title);
  const prize = formatPrize(t);
  const registered = t.tournament_participants.length;
  const rows: [string, string | null][] = [
    ["Дата и время", formatLeagueDate(t.starts_at) ?? "Будет объявлено"],
    ["Формат", FORMAT_LABEL[t.format]],
    ["Ограничение MMR", mmrLimitText(div)],
    ["Призовой фонд", prize],
    ["Команды", `${registered} из ${t.team_limit}`],
  ];
  const open = t.status === "registration_open";
  return (
    <article className="card-lift grid overflow-hidden rounded-3xl border border-border bg-card md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="bg-hero relative min-h-40 p-6 text-navy-foreground">
        {t.image_url && <img src={t.image_url} alt="" className="absolute inset-0 size-full object-cover opacity-20" />}
        <div className="relative">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${open ? "bg-win text-primary-foreground" : "bg-navy-foreground/20"}`}>
            {STATUS_LABEL[t.status]}
          </span>
          <h3 className="mt-4 break-words text-2xl sm:text-3xl">{t.title}</h3>
          {div && <p className="mt-1 text-sm text-sky">{DIVISIONS.find((d) => d.id === div)?.name}</p>}
        </div>
      </div>
      <div className="p-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="label-xs">{k}</dt>
              <dd className="mt-0.5 break-words text-sm font-semibold text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (registered / Math.max(1, t.team_limit)) * 100)}%` }} />
        </div>
        <Link to="/tournaments/$tournamentId" params={{ tournamentId: t.id }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] sm:w-auto">
          {open ? "Участвовать" : "Подробнее"} <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function ChampionCard({ t }: { t: CatalogItem }) {
  const win = t.placements.find((p) => p.place === 1);
  const second = t.placements.find((p) => p.place === 2);
  const logo = (id?: string) => t.tournament_participants.find((p) => p.team_id === id)?.logo_url ?? undefined;
  const final = win && second
    ? t.matches
        .filter((m) => m.score_a != null && m.score_b != null && [m.team_a_id, m.team_b_id].includes(win.team_id) && [m.team_a_id, m.team_b_id].includes(second.team_id))
        .sort((a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime())[0]
    : undefined;
  const score = final ? (final.team_a_id === win!.team_id ? `${final.score_a}:${final.score_b}` : `${final.score_b}:${final.score_a}`) : null;
  return (
    <li>
      <Link to="/tournaments/$tournamentId" params={{ tournamentId: t.id }} className="card-lift block h-full rounded-3xl border border-border bg-card p-5 hover:border-primary">
        <p className="label-xs">{formatLeagueDate(t.starts_at, false) ?? "Дата не указана"}</p>
        <h3 className="mt-1 break-words text-lg text-foreground">{t.title}</h3>
        {win ? (
          <div className="mt-4 flex min-w-0 items-center gap-3">
            <span className="shrink-0"><TeamLogo name={win.team_name} logo={logo(win.team_id)} /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-bold text-accent"><Crown className="size-3.5" /> Чемпион</p>
              <p className="truncate font-bold text-foreground">{win.team_name}</p>
            </div>
            {score && <span className="ml-auto shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-extrabold text-foreground">{score}</span>}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Итоги не внесены</p>
        )}
        {second && <p className="mt-2 truncate text-sm text-muted-foreground">Финалист: <span className="font-semibold text-foreground">{second.team_name}</span></p>}
      </Link>
    </li>
  );
}
