import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, CalendarClock, MapPin, Medal, Trophy, Users, Wifi } from "lucide-react";
import { ApplyDialog } from "@/components/ApplyDialog";
import { BracketView } from "@/components/BracketView";
import { GroupStage } from "@/components/GroupStage";
import { MatchSchedule } from "@/components/MatchSchedule";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel, SafeMarkdown, StatusBadge, TournamentImage } from "@/components/league";
import { useMyApplications } from "@/hooks/use-my-applications";
import { tournamentQuery } from "@/lib/league-api";
import {
  APPLICATION_LABEL,
  FORMAT_LABEL,
  countdown,
  formatLeagueDate,
  formatPrize,
  freePlaces,
  toViewModel,
} from "@/lib/league";
import { setReturnTo } from "@/lib/return-to";

export const Route = createFileRoute("/tournaments/$tournamentId")({
  validateSearch: (search: Record<string, unknown>): { apply?: boolean } =>
    search.apply === true || search.apply === "1" || search.apply === 1 ? { apply: true } : {},
  head: () => ({
    meta: [
      { title: "Турнир — TrueDotaLeague" },
      { name: "description", content: "Страница турнира лиги по Dota 2: участники, расписание, сетка и итоги." },
      { property: "og:title", content: "Турнир TrueDotaLeague" },
      { property: "og:description", content: "Участники, расписание матчей, сетка плей-офф и итоговые места турнира." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TournamentPage,
});

const placeColor = (p: number) =>
  p === 1 ? "text-accent" : p === 2 ? "text-primary" : p === 3 ? "text-win" : "text-muted-foreground";

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-20 p-5">
      <h2 className="mb-3 text-2xl text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function TournamentPage() {
  const { tournamentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: t, isLoading, error } = useQuery({ ...tournamentQuery(tournamentId), refetchInterval: 15000 });
  const { user, byTournament } = useMyApplications();
  const [applyOpen, setApplyOpen] = useState(false);

  useEffect(() => {
    if (search.apply && t?.status === "registration_open" && user) setApplyOpen(true);
  }, [search.apply, t?.status, user]);

  useEffect(() => {
    if (t && window.location.hash === "#results") {
      document.getElementById("results")?.scrollIntoView();
    }
  }, [t]);

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-8"><LoadingPanel text="Загружаем турнир…" /></div>;
  if (error || !t)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <LoadingPanel text="Турнир не найден или ещё не опубликован." />
        <Link to="/tournaments" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
          ← Все турниры
        </Link>
      </div>
    );

  const accepted = t.tournament_participants.length;
  const prize = formatPrize(t);
  const vm = toViewModel(t.tournament_participants, t.matches, t.groups);
  const placements = [...t.placements].sort((a, b) => a.place - b.place);
  const application = byTournament.get(t.id);
  const hasSchedule = vm.bracket.length > 0 || vm.groupMatches.length > 0;

  const applyClick = () => {
    if (!user) {
      setReturnTo(`/tournaments/${t.id}?apply=1`);
      navigate({ to: "/auth" });
      return;
    }
    setApplyOpen(true);
  };

  let mainButton: ReactNode = null;
  const btn = "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-bold shadow-sm";
  if (application && t.status !== "finished" && t.status !== "cancelled") {
    mainButton = <span className={`${btn} bg-secondary text-secondary-foreground`}>{APPLICATION_LABEL[application]}</span>;
  } else if (t.status === "registration_open") {
    mainButton = (
      <button onClick={applyClick} className={`${btn} bg-primary text-primary-foreground`}>
        Подать заявку
      </button>
    );
  } else if (t.status === "finished" && placements.length > 0) {
    mainButton = (
      <a href="#results" className={`${btn} border border-border bg-white/70 text-foreground hover:text-primary`}>
        Посмотреть итоги
      </a>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 lg:px-8">
      <Link to="/tournaments" className="text-sm font-semibold text-primary hover:underline">
        ← Все турниры
      </Link>

      <header className="panel overflow-hidden">
        <TournamentImage src={t.image_url} title={t.title} className="aspect-[16/6] w-full text-6xl" />
        <div className="space-y-3 p-5">
          <StatusBadge status={t.status} />
          <h1 className="break-words text-4xl leading-none text-foreground sm:text-5xl">{t.title}</h1>
          {t.status === "cancelled" && (
            <p className="font-semibold text-destructive">Турнир отменён{t.cancel_reason ? `: ${t.cancel_reason}` : ""}</p>
          )}
          {mainButton}
          <ul className="grid gap-2 pt-2 text-sm text-foreground sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 shrink-0 text-primary" />
              {t.starts_at ? `Старт: ${formatLeagueDate(t.starts_at)}` : "Дата старта не объявлена"}
            </li>
            <li className="flex items-center gap-2">
              <Trophy className="size-4 shrink-0 text-primary" /> Формат: {FORMAT_LABEL[t.format]}
            </li>
            {prize && (
              <li className="flex items-center gap-2">
                <Medal className="size-4 shrink-0 text-primary" /> Призовой фонд: {prize}
              </li>
            )}
            <li className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-primary" /> Участников: {accepted} из {t.team_limit}
            </li>
            <li className="flex items-center gap-2">
              {t.mode === "offline" ? <MapPin className="size-4 text-primary" /> : <Wifi className="size-4 text-primary" />}
              {t.mode === "offline" ? "Офлайн" : "Онлайн"}
            </li>
          </ul>
        </div>
      </header>

      {t.description.trim() && (
        <Section title="Описание">
          <SafeMarkdown body={t.description} />
        </Section>
      )}

      <Section title="Регистрация">
        <ul className="space-y-1 text-sm text-foreground">
          <li>
            Открытие:{" "}
            {t.registration_opens_at ? formatLeagueDate(t.registration_opens_at) : "откроется администратором вручную"}
          </li>
          {t.registration_closes_at && (
            <li>
              Окончание приёма заявок: {formatLeagueDate(t.registration_closes_at)}
              {t.status === "registration_open" && ` · осталось ${countdown(t.registration_closes_at)}`}
            </li>
          )}
          <li>
            Лимит команд: {t.team_limit} · свободно мест: {freePlaces(t.team_limit, accepted)}
          </li>
          {t.status === "registration_closed" && t.closed_reason && <li>Регистрация закрыта: {t.closed_reason}</li>}
          <li className="text-muted-foreground">
            Заявку подаёт владелец или капитан команды после ознакомления с регламентом. Решение принимают администраторы.
          </li>
        </ul>
      </Section>

      {t.mode === "offline" && (
        <Section title="Место проведения">
          {t.venue_name && <p className="font-semibold text-foreground">{t.venue_name}</p>}
          {t.venue_address && <p className="text-sm text-muted-foreground">{t.venue_address}</p>}
        </Section>
      )}

      <Link
        to="/regulations"
        className="panel flex items-center gap-2 p-4 text-sm font-semibold text-primary hover:underline"
      >
        <BookOpen className="size-4" /> Общий регламент лиги
      </Link>

      <Section title={`Подтверждённые команды (${accepted})`}>
        {accepted === 0 ? (
          <p className="text-sm text-muted-foreground">Подтверждённых команд пока нет.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.tournament_participants.map((p) => (
              <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-white/50 px-3 py-2 text-sm">
                <TeamLogo name={p.team_name} logo={p.logo_url ?? undefined} size="md" />
                <span className="truncate font-medium text-foreground">{p.team_name}</span>
                {p.team_tag && <span className="text-xs font-semibold text-primary">[{p.team_tag}]</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Расписание матчей">
        {hasSchedule ? (
          <MatchSchedule teams={vm.teams} groupMatches={vm.groupMatches} bracket={vm.bracket} />
        ) : (
          <p className="text-sm text-muted-foreground">Расписание ещё не опубликовано.</p>
        )}
      </Section>

      {vm.groups.length > 0 && (
        <Section title="Групповой этап">
          <GroupStage groups={vm.groups} matches={vm.groupMatches} readOnly />
        </Section>
      )}

      {vm.bracket.length > 0 && (
        <Section title="Плей-офф">
          <BracketView matches={vm.bracket} teams={vm.teams} readOnly />
        </Section>
      )}

      {placements.length > 0 && (
        <Section title="Итоговые места" id="results">
          <ul className="space-y-1.5">
            {placements.map((p) => {
              const snap = t.tournament_participants.find((x) => x.team_id === p.team_id);
              return (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Medal className={`size-4 ${placeColor(p.place)}`} />
                  <span className="w-6 font-bold text-muted-foreground">{p.place}</span>
                  <TeamLogo name={p.team_name} logo={snap?.logo_url ?? undefined} />
                  <span className="flex-1 truncate text-foreground">{p.team_name}</span>
                  <span className="font-bold text-foreground">+{p.points} TDL</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <ApplyDialog tournamentId={t.id} title={t.title} open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}
