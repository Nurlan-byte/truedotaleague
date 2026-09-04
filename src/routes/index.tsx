import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Medal, Plus, Radio, Shield, Trophy, Users } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { useAdmin } from "@/hooks/use-admin";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TrueDotaLeague — лига по Dota 2" },
      {
        name: "description",
        content:
          "Добро пожаловать в TrueDotaLeague: завершённые турниры, команды лиги, рейтинг в TDL points и трансляция турнира онлайн.",
      },
      { property: "og:title", content: "TrueDotaLeague — лига по Dota 2" },
      {
        property: "og:description",
        content: "Турниры, команды и рейтинги лиги по Dota 2 в одном месте.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { state } = useTournamentState();
  const { isAdmin } = useAdmin();
  const finished = state.history;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <section className="panel p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">TrueDotaLeague</p>
        <h1 className="mt-2 text-4xl leading-none text-foreground sm:text-5xl">
          Добро пожаловать в лигу по Dota 2
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Здесь проходят турниры лиги: групповые этапы, сетки плей-офф и рейтинг команд в TDL
          points. Следите за ходом матчей онлайн и смотрите историю чемпионов.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/live"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
          >
            <Radio className="size-4" /> Турнир онлайн
          </Link>
          <Link
            to="/rating-teams"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            <Trophy className="size-4" /> Рейтинг команд
          </Link>
          {isAdmin && (
            <Link
              to="/create"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground shadow-sm"
            >
              <Plus className="size-4" /> Создать турнир
            </Link>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Завершённых турниров", value: finished.length, icon: Crown },
          { label: "Команд в лиге", value: state.teams.length, icon: Shield },
          {
            label: "Разыграно TDL points",
            value: finished.reduce(
              (sum, t) => sum + t.placements.reduce((s, p) => s + p.points, 0),
              0,
            ),
            icon: Trophy,
          },
        ].map((card) => (
          <div key={card.label} className="panel p-5">
            <card.icon className="size-5 text-primary" />
            <p className="mt-2 text-3xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl text-foreground">
              <Crown className="size-5 text-accent" /> Завершённые турниры
            </h2>
            <Link to="/tournaments" className="text-xs font-semibold text-primary hover:underline">
              Все турниры
            </Link>
          </div>
          {finished.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Завершённых турниров пока нет — они появятся здесь после финала.
            </p>
          ) : (
            <ul className="space-y-3">
              {finished.slice(0, 4).map((t) => (
                <li key={t.id} className="rounded-lg border border-border bg-white/50 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  </div>
                  {t.placements[0] && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
                      <Medal className="size-4 text-accent" />
                      <TeamLogo name={t.placements[0].teamName} logo={t.placements[0].logo} />
                      <span className="truncate">{t.placements[0].teamName}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl text-foreground">
              <Shield className="size-5 text-primary" /> Команды лиги
            </h2>
            <Link to="/teams" className="text-xs font-semibold text-primary hover:underline">
              Все команды
            </Link>
          </div>
          {state.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Регистрация команд открыта — заявите свою команду в разделе{" "}
              <Link to="/teams" className="font-semibold text-primary hover:underline">
                «Команды»
              </Link>
              , и она появится здесь.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {state.teams.slice(0, 10).map((team) => (
                <li
                  key={team.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-white/50 px-3 py-2 text-sm text-foreground"
                >
                  <TeamLogo name={team.name} logo={team.logo} />
                  <span className="truncate">{team.name}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/players"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <Users className="size-4" /> Рейтинг игроков
          </Link>
        </section>
      </div>
    </div>
  );
}
