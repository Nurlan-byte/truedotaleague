import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, CalendarClock, MapPin, Plus, Search, Trophy, Users, Wifi } from "lucide-react";
import { LoadingPanel, StatusBadge, TournamentImage } from "@/components/league";
import { QueryFeedback } from "@/components/LeaguePageIntro";
import { useAdmin } from "@/hooks/use-admin";
import { useMyApplications } from "@/hooks/use-my-applications";
import { catalogQuery, type CatalogItem } from "@/lib/league-api";
import type { ReactNode } from "react";
import {
  APPLICATION_LABEL,
  countdown,
  formatLeagueDate,
  formatPrize,
  freePlaces,
  sortCatalog,
  teamsThatPlayed,
  nextMatch,
  type ApplicationStatus,
  type CatalogSort,
} from "@/lib/league";
import { setReturnTo } from "@/lib/return-to";

export const Route = createFileRoute("/tournaments/")({
  head: () => ({
    meta: [
      { title: "Турниры — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Все турниры лиги по Dota 2: анонсы, открытая регистрация, идущие турниры и итоги.",
      },
      { property: "og:title", content: "Турниры TrueDotaLeague" },
      {
        property: "og:description",
        content: "Каталог турниров лиги: регистрация команд, расписание и результаты.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const { isAdmin } = useAdmin();
  const { data, isPending, isError, refetch } = useQuery(catalogQuery());
  const { byTournament } = useMyApplications();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CatalogSort>("default");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const items = (data ?? []).filter((t) => !needle || t.title.toLowerCase().includes(needle));
    return sortCatalog(items, sort);
  }, [data, q, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-4xl text-foreground">
          <Trophy className="size-7 text-accent" /> Турниры
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/regulations"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/60 px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            <BookOpen className="size-4" /> Регламент
          </Link>
          {isAdmin && (
            <Link
              to="/tournaments/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
            >
              <Plus className="size-4" /> Создать турнир
            </Link>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Актуальные соревнования лиги, открытые регистрации и результаты. Выберите турнир, чтобы
        увидеть расписание и условия участия.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Поиск турнира"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по названию"
            className="w-full rounded-lg border border-input bg-white/70 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:bg-white"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CatalogSort)}
          aria-label="Сортировка"
          className="rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground"
        >
          <option value="default">Сначала актуальные</option>
          <option value="start_asc">По дате старта ↑</option>
          <option value="start_desc">По дате старта ↓</option>
          <option value="title">По названию</option>
        </select>
      </div>

      <div className="mt-5">
        {isPending ? (
          <LoadingPanel text="Загружаем турниры…" />
        ) : isError ? (
          <QueryFeedback text="Не удалось загрузить турниры." retry={() => void refetch()} />
        ) : list.length === 0 ? (
          <LoadingPanel
            text={q ? "Ничего не найдено." : "Турниров пока нет — следите за анонсами."}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((t) => (
              <TournamentCard key={t.id} t={t} application={byTournament.get(t.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TournamentCard({ t, application }: { t: CatalogItem; application?: ApplicationStatus }) {
  const navigate = useNavigate();
  const { user } = useMyApplications();
  const accepted = t.tournament_participants.length;
  const winner = t.placements.find((p) => p.place === 1);
  const next = nextMatch(t.matches);
  const nameOf = (id: string | null) =>
    t.tournament_participants.find((p) => p.team_id === id)?.team_name ?? "—";
  const prize = formatPrize(t);

  const btn =
    "relative z-10 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-bold shadow-sm";
  const primary = `${btn} bg-primary text-primary-foreground`;
  const secondary = `${btn} border border-border bg-white/70 text-foreground hover:border-primary hover:text-primary`;

  let details: ReactNode = null;
  let action: ReactNode = (
    <Link
      to="/tournaments/$tournamentId"
      params={{ tournamentId: t.id }}
      className={secondary}
      onClick={(e) => e.stopPropagation()}
    >
      Подробнее
    </Link>
  );

  switch (t.status) {
    case "announced":
      details = t.registration_opens_at
        ? `Регистрация откроется ${formatLeagueDate(t.registration_opens_at)}`
        : "Регистрация откроется позже";
      break;
    case "registration_open":
      details = (
        <>
          {t.registration_closes_at && (
            <span className="block">
              Приём заявок до {formatLeagueDate(t.registration_closes_at)} · осталось{" "}
              {countdown(t.registration_closes_at)}
            </span>
          )}
          <span className="block">
            Принято команд: {accepted} · свободно мест: {freePlaces(t.team_limit, accepted)}
          </span>
        </>
      );
      if (!application) {
        action = (
          <button
            className={primary}
            onClick={(e) => {
              e.stopPropagation();
              const path = `/tournaments/${t.id}?apply=1`;
              if (!user) {
                setReturnTo(path);
                navigate({ to: "/auth" });
              } else {
                navigate({
                  to: "/tournaments/$tournamentId",
                  params: { tournamentId: t.id },
                  search: { apply: true },
                });
              }
            }}
          >
            Подать заявку
          </button>
        );
      }
      break;
    case "registration_closed":
      details = (
        <>
          {t.closed_reason && <span className="block">{t.closed_reason}</span>}
          <span className="block">Участников: {accepted}</span>
        </>
      );
      break;
    case "live":
      details = (
        <>
          <span className="block">Участников: {accepted}</span>
          {next && (
            <span className="block">
              Следующий матч: {nameOf(next.team_a_id)} — {nameOf(next.team_b_id)},{" "}
              {formatLeagueDate(next.scheduled_at)}
            </span>
          )}
        </>
      );
      action = (
        <Link
          to="/tournaments/$tournamentId"
          params={{ tournamentId: t.id }}
          className={primary}
          onClick={(e) => e.stopPropagation()}
        >
          Смотреть турнир
        </Link>
      );
      break;
    case "finished":
      details = (
        <>
          {winner && (
            <span className="block font-semibold text-foreground">
              🏆 Победитель: {winner.team_name}
            </span>
          )}
          <span className="block">Команд сыграло: {teamsThatPlayed(t.matches)}</span>
        </>
      );
      action = (
        <Link
          to="/tournaments/$tournamentId"
          params={{ tournamentId: t.id }}
          hash="results"
          className={secondary}
          onClick={(e) => e.stopPropagation()}
        >
          Посмотреть итоги
        </Link>
      );
      break;
    case "cancelled":
      details = (
        <span className="font-semibold text-destructive">
          Турнир отменён{t.cancel_reason ? `: ${t.cancel_reason}` : ""}
        </span>
      );
      break;
  }

  if (application && t.status !== "finished" && t.status !== "cancelled") {
    action = (
      <span
        className={`${btn} ${
          application === "accepted"
            ? "bg-win/15 text-win"
            : application === "rejected"
              ? "bg-destructive/10 text-destructive"
              : "bg-secondary text-secondary-foreground"
        }`}
      >
        {APPLICATION_LABEL[application]}
      </span>
    );
  }

  return (
    <li
      className={`panel relative flex min-w-0 flex-col overflow-hidden transition-shadow hover:shadow-lg focus-within:ring-2 focus-within:ring-primary ${
        t.status === "cancelled" ? "opacity-80" : ""
      }`}
    >
      <TournamentImage
        src={t.image_url}
        title={t.title}
        className="aspect-[16/7] w-full text-4xl"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={t.status} />
        </div>
        <Link
          to="/tournaments/$tournamentId"
          params={{ tournamentId: t.id }}
          onClick={(e) => e.stopPropagation()}
          className="line-clamp-2 break-words text-lg font-bold leading-tight text-foreground after:absolute after:inset-0 hover:text-primary"
        >
          {t.title}
        </Link>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" />
            {t.starts_at ? `Старт: ${formatLeagueDate(t.starts_at)}` : "Дата старта не объявлена"}
          </li>
          <li className="flex items-center gap-1.5">
            {t.mode === "offline" ? (
              <MapPin className="size-3.5 shrink-0" />
            ) : (
              <Wifi className="size-3.5 shrink-0" />
            )}
            {t.mode === "offline" ? "Офлайн" : "Онлайн"}
          </li>
          {prize && (
            <li className="flex items-center gap-1.5">
              <Trophy className="size-3.5 shrink-0" /> Призовой фонд: {prize}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Users className="size-3.5 shrink-0" /> Лимит команд: {t.team_limit}
          </li>
        </ul>
        {details && (
          <div className="space-y-0.5 break-words text-xs text-muted-foreground">{details}</div>
        )}
        <div className="mt-auto pt-2">{action}</div>
      </div>
    </li>
  );
}
