import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Shield,
  Trophy,
  Users,
  Check,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import poster from "@/assets/freedom-league-season-2.asset.json";
import { Button } from "@/components/ui/button";
import { ApplyDialog } from "@/components/ApplyDialog";
import { StaffPanel } from "@/components/StaffPanel";
import { ConfirmedTeams } from "@/components/tournament/ConfirmedTeams";
import { TeamLogo } from "@/components/TeamLogo";
import { useAdmin } from "@/hooks/use-admin";
import { useMyApplications } from "@/hooks/use-my-applications";
import { supabase } from "@/integrations/supabase/client";
import { freedomQuery } from "@/lib/freedom-api";
import { FREEDOM, FREEDOM_TITLE, freedomTable, isBo2, money } from "@/lib/freedom";
import { APPLICATION_LABEL, STATUS_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";
import { isStaffQuery } from "@/lib/league-admin";
import { seoUrl } from "@/lib/seo";
import { fileToLogoDataUrl } from "@/lib/image";

const description =
  "TDL Freedom League #2: 4–27 декабря 2026, до 16 команд, Bo2 без плей-офф. Регистрация, турнирная таблица и календарь матчей Dota 2 в Казахстане.";
export const Route = createFileRoute("/freedom-league")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { view?: "table" | "calendar" | "teams"; round?: number; team?: string } => ({
    ...(s["view"] === "calendar" || s["view"] === "teams" || s["view"] === "table"
      ? { view: s["view"] }
      : {}),
    ...(Number.isInteger(Number(s["round"])) && Number(s["round"]) > 0
      ? { round: Math.min(15, Number(s["round"])) }
      : {}),
    ...(typeof s["team"] === "string" ? { team: s["team"] } : {}),
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(freedomQuery());
  },
  head: () => ({
    meta: [
      { title: "TDL Freedom League #2 — таблица и календарь | TrueDotaLeague" },
      { name: "description", content: description },
      { property: "og:title", content: "TDL Freedom League #2 — новый сезон" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...seoUrl("/freedom-league").meta,
    ],
    links: seoUrl("/freedom-league").links,
  }),
  errorComponent: () => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-6xl p-8">
        <h1 className="text-2xl">TDL Freedom League</h1>
        <p className="my-4" role="alert">
          Не удалось загрузить сезон.
        </p>
        <Button onClick={() => router.invalidate()}>Попробовать снова</Button>
      </div>
    );
  },
  notFoundComponent: () => <p className="p-8">Сезон не найден.</p>,
  component: FreedomLeague,
});

function FreedomLeague() {
  const { data: season } = useSuspenseQuery(freedomQuery());
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/freedom-league" });
  const { isAdmin } = useAdmin();
  const { user, byTournament, rejectReason } = useMyApplications();
  const staff = useQuery(isStaffQuery(season?.id ?? "", user?.id));
  const qc = useQueryClient();
  const [apply, setApply] = useState(false);
  const [manage, setManage] = useState(false);
  const initialize = useMutation({
    mutationFn: async () => {
      const response = await fetch(poster.url);
      if (!response.ok) throw new Error("Не удалось загрузить афишу");
      const image = await fileToLogoDataUrl(
        new File([await response.blob()], "freedom.png", { type: "image/png" }),
        768,
      );
      const { error } = await supabase.rpc("initialize_freedom_season", { p_image_url: image });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      toast.success("Сезон создан, регистрация открыта");
    },
    onError: (e) => toast.error(rpcErrorText(e)),
  });
  const participants = season?.tournament_participants ?? [];
  const matches = [...(season?.matches ?? [])]
    .filter((m) => m.stage === "group")
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
  const rows = freedomTable(participants, matches);
  const names = new Map(participants.map((p) => [p.team_id, p]));
  const played = matches.filter((m) => isBo2(m.score_a, m.score_b)).length;
  const view = search.view ?? "table";
  const status = season ? byTournament.get(season.id) : undefined;
  const canApply =
    season?.status === "registration_open" &&
    participants.length < FREEDOM.limit &&
    (!status || status === "rejected" || status === "withdrawn");
  const filtered = matches.filter(
    (m) =>
      (!search.round || m.round === search.round) &&
      (!search.team || m.team_a_id === search.team || m.team_b_id === search.team),
  );
  const rounds = [...new Set(matches.map((m) => m.round))];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase text-win">
            Dota 2 · Казахстан · Сезон 2026
          </p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
            TDL Freedom League <span className="text-win">#2</span>
          </h1>
          <p className="mt-2 text-muted-foreground">16 команд. 15 туров. Один чемпион.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-win">
          <Radio className="size-4" />
          {season ? STATUS_LABEL[season.status] : "Новый сезон"}
        </span>
      </header>
      <section className="overflow-hidden bg-navy text-navy-foreground" aria-label="Анонс сезона">
        <img
          src={poster.url}
          alt="Афиша TDL Freedom League #2: 4–27 декабря, призовой фонд до 700 000 тенге"
          width={768}
          height={768}
          className="mx-auto max-h-[620px] w-full object-contain"
          fetchPriority="high"
        />
        <div className="grid gap-4 border-t border-navy-foreground/20 px-5 py-5 sm:grid-cols-3">
          <p className="flex items-center gap-3">
            <CalendarDays className="size-5 text-sky" />
            <span>
              <b className="block">4–27 декабря 2026</b>
              <span className="text-sm">Онлайн · UTC+5</span>
            </span>
          </p>
          <p className="flex items-center gap-3">
            <Users className="size-5 text-win" />
            <span>
              <b className="block">{participants.length} / 16 команд</b>
              <span className="text-sm">Без ограничений MMR</span>
            </span>
          </p>
          <p className="flex items-center gap-3">
            <Trophy className="size-5 text-gold" />
            <span>
              <b className="block">До {money(FREEDOM.maxPrize)}</b>
              <span className="text-sm">При участии 16 команд</span>
            </span>
          </p>
        </div>
      </section>

      <section
        className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-7"
        aria-label="Регистрация"
      >
        <div>
          <h2 className="text-xl font-bold">Регистрация команды</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Взнос {money(FREEDOM.fee)} · можно 4 платежа по {money(FREEDOM.installment)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Приём заявок до 4 декабря, 12:00 (UTC+5). Подтверждение администрацией.
          </p>
          {status && (
            <p className="mt-2 text-sm font-semibold">
              {APPLICATION_LABEL[status]}
              {status === "rejected" && season && rejectReason.get(season.id)
                ? `: ${rejectReason.get(season.id)}`
                : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canApply &&
            (user ? (
              <Button size="lg" onClick={() => setApply(true)}>
                <Shield />
                {status === "rejected" ? "Подать повторно" : "Зарегистрировать команду"}
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/auth">
                  <Shield />
                  Войти через Discord
                </Link>
              </Button>
            ))}
          {!season && isAdmin && (
            <Button disabled={initialize.isPending} onClick={() => initialize.mutate()}>
              {initialize.isPending ? "Открываем…" : "Открыть регистрацию сезона"}
            </Button>
          )}
          {!season && !isAdmin && (
            <p className="text-sm text-muted-foreground">Регистрация скоро откроется.</p>
          )}
          {season && !canApply && !status && (
            <p className="text-sm text-muted-foreground">
              {participants.length >= 16 ? "Все места заняты" : "Регистрация закрыта"}
            </p>
          )}
          <Button variant="outline" asChild>
            <a href="https://discord.gg/ZJBzeKcjvU" target="_blank" rel="noreferrer">
              Discord <ExternalLink />
            </a>
          </Button>
        </div>
      </section>

      <section className="py-7" aria-label="Турнирная таблица и календарь">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <nav className="flex flex-wrap gap-1" aria-label="Разделы лиги">
            {(
              [
                { key: "table", name: "Таблица", icon: Trophy },
                { key: "calendar", name: "Календарь", icon: CalendarDays },
                { key: "teams", name: "Команды", icon: Users },
              ] as const
            ).map((item) => (
              <Button key={item.key} variant={view === item.key ? "default" : "ghost"} asChild>
                <Link
                  to="/freedom-league"
                  search={{ ...search, view: item.key }}
                  resetScroll={false}
                >
                  <item.icon />
                  {item.name}
                </Link>
              </Button>
            ))}
          </nav>
          <p className="text-sm text-muted-foreground">
            Сыграно {played} / {matches.length || "—"} матчей
          </p>
        </div>
        {view === "table" && (
          <>
            <h2 className="mb-3 text-2xl font-bold">Турнирная таблица</h2>
            <div className="overflow-x-auto border-y border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground">
                  <tr>
                    <th className="px-2 py-3 text-left">#</th>
                    <th className="min-w-[150px] px-2 py-3 text-left">Команда</th>
                    {["И", "В", "Н", "П"].map((h) => (
                      <th key={h} className="px-2 py-3">
                        {h}
                      </th>
                    ))}
                    <th className="hidden px-3 sm:table-cell">Карты</th>
                    <th className="px-3 py-3 text-foreground">Очки</th>
                    <th className="hidden px-3 lg:table-cell">Форма</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.team_id} className="border-t border-border hover:bg-secondary/60">
                      <td className="px-2 py-3 font-bold text-win">{row.rank}</td>
                      <td className="px-2 py-3">
                        <Link
                          to="/teams/$teamId"
                          params={{ teamId: row.team_id }}
                          className="flex items-center gap-2 font-semibold hover:text-primary"
                        >
                          <TeamLogo name={row.team_name} logo={row.logo_url ?? undefined} />
                          <span className="max-w-[160px] break-words">{row.team_name}</span>
                        </Link>
                      </td>
                      {[row.played, row.won, row.drawn, row.lost].map((n, i) => (
                        <td key={i} className="px-2 text-center tabular-nums">
                          {n}
                        </td>
                      ))}
                      <td className="hidden px-3 text-center sm:table-cell">
                        {row.mapsFor}:{row.mapsAgainst}
                      </td>
                      <td className="px-3 text-center text-base font-extrabold tabular-nums">
                        {row.points}
                      </td>
                      <td className="hidden px-3 text-center lg:table-cell">
                        {row.form.slice(-5).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 16 - rows.length) }, (_, i) => (
                    <tr
                      key={`vacant-${i}`}
                      className="border-t border-border text-muted-foreground"
                    >
                      <td className="px-2 py-3">{rows.length + i + 1}</td>
                      <td className="px-2 py-3">Место свободно</td>
                      <td className="px-2 text-center">—</td>
                      <td className="px-2 text-center">—</td>
                      <td className="px-2 text-center">—</td>
                      <td className="px-2 text-center">—</td>
                      <td className="hidden px-3 text-center sm:table-cell">—</td>
                      <td className="px-3 text-center">—</td>
                      <td className="hidden lg:table-cell" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              И — игры, В — победы, Н — ничьи, П — поражения. 2:0 — 3 очка · 1:1 — 1 очко · 0:2 — 0
              очков. При равенстве очков место общее до утверждения правил тай-брейка.
            </p>
          </>
        )}
        {view === "calendar" && (
          <>
            <h2 className="text-2xl font-bold">Календарь матчей</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Суббота и воскресенье · 12:00–16:00 (UTC+5) · Bo2
            </p>
            <div className="my-5 flex flex-wrap gap-3">
              <label className="text-sm">
                Тур
                <select
                  aria-label="Тур"
                  className="ml-2 rounded-md border border-input bg-background p-2"
                  value={search.round ?? ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const { round: _round, ...rest } = search;
                    navigate({
                      search: value ? { ...rest, round: value } : rest,
                      resetScroll: false,
                    });
                  }}
                >
                  <option value="">Все туры</option>
                  {rounds.map((r) => (
                    <option key={r} value={r}>
                      Тур {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Команда
                <select
                  aria-label="Команда в календаре"
                  className="ml-2 max-w-[220px] rounded-md border border-input bg-background p-2"
                  value={search.team ?? ""}
                  onChange={(e) => {
                    const { team: _team, ...rest } = search;
                    navigate({
                      search: e.target.value ? { ...rest, team: e.target.value } : rest,
                      resetScroll: false,
                    });
                  }}
                >
                  <option value="">Все команды</option>
                  {participants.map((p) => (
                    <option key={p.team_id} value={p.team_id}>
                      {p.team_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {matches.length === 0 ? (
              <div className="border-y border-border py-10 text-center">
                <CalendarDays className="mx-auto mb-3 size-8 text-win" />
                <p className="font-semibold">Жеребьёвка ещё не проведена</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  После закрытия регистрации появятся все пары по турам; даты и время назначит
                  администрация.
                </p>
              </div>
            ) : (
              <>
                {rounds
                  .filter((r) => !search.round || r === search.round)
                  .map((r) => (
                    <div key={r} className="mb-6">
                      <h3 className="border-b border-border py-3 text-lg font-bold">Тур {r}</h3>
                      {filtered
                        .filter((m) => m.round === r)
                        .map((m) => {
                          const a = m.team_a_id ? names.get(m.team_a_id) : undefined;
                          const b = m.team_b_id ? names.get(m.team_b_id) : undefined;
                          return (
                            <div
                              key={m.id}
                              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border py-4"
                            >
                              <TeamMatchLink team={a} />
                              <span className="rounded-md bg-secondary px-3 py-2 font-bold tabular-nums">
                                {isBo2(m.score_a, m.score_b) ? `${m.score_a}:${m.score_b}` : "vs"}
                              </span>
                              <TeamMatchLink team={b} />
                              <p className="col-span-3 text-center text-xs text-muted-foreground">
                                {m.scheduled_at
                                  ? formatLeagueDate(m.scheduled_at)
                                  : "Дата и время уточняются"}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  ))}
                {filtered.length === 0 && (
                  <p className="py-8 text-muted-foreground">Матчей по выбранным условиям нет.</p>
                )}
              </>
            )}
          </>
        )}
        {view === "teams" && (
          <>
            <h2 className="mb-4 text-2xl font-bold">
              Подтверждённые команды · {participants.length}
            </h2>
            {participants.length ? (
              <ConfirmedTeams participants={participants} />
            ) : (
              <p className="py-8 text-muted-foreground">
                Первые участники появятся после подтверждения заявок.
              </p>
            )}
          </>
        )}
      </section>

      <section className="border-t border-border py-7">
        <h2 className="mb-5 text-2xl font-bold">Весь сезон решает. Не один удачный день.</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 font-bold">Формат чемпионата</h3>
            <ul className="space-y-2 text-sm">
              {[
                "До 16 команд, каждый сыграет с каждым",
                "15 туров и 120 матчей Bo2 при 16 участниках",
                "Без плей-офф — чемпион определяется по очкам",
                "Стримы интересных матчей с комментатором",
                "Тестовый сезон; в 2027 году планируется более длительная лига",
              ].map((text) => (
                <li key={text} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-win" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-bold">Призовой фонд</h3>
            <p className="text-sm text-muted-foreground">
              Стартовый фонд от TDL — {money(FREEDOM.initialPrize)}. Итоговая сумма зависит от
              количества участвующих команд.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {FREEDOM.tiers.map((tier) => (
                <div key={tier.teams} className="border-l-2 border-win pl-3">
                  <p className="text-xs text-muted-foreground">{tier.teams} команд</p>
                  <p className="mt-1 font-bold">{money(tier.prize)}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm font-semibold">
              При 16 командах: 🥇 {money(400000)} · 🥈 {money(200000)} · 🥉 {money(100000)}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/regulations">
              Регламент <ChevronRight />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/my-team">
              Моя команда <ChevronRight />
            </Link>
          </Button>
        </div>
      </section>
      {season && user && (isAdmin || staff.data) && (
        <section className="border-t border-border py-6">
          <Button variant="secondary" onClick={() => setManage((v) => !v)}>
            <Shield />
            {manage ? "Скрыть управление" : "Управление лигой"}
          </Button>
          {manage && (
            <div className="mt-5">
              <StaffPanel
                t={season}
                isAdmin={isAdmin}
                isStaff={isAdmin || !!staff.data}
                userId={user.id}
              />
            </div>
          )}
        </section>
      )}
      {season && (
        <ApplyDialog
          tournamentId={season.id}
          title={FREEDOM_TITLE}
          open={apply}
          onOpenChange={setApply}
        />
      )}
    </div>
  );
}
function TeamMatchLink({
  team,
}: {
  team: { team_id: string; team_name: string; logo_url: string | null } | undefined;
}) {
  if (!team) return <span className="text-center text-muted-foreground">Команда определится</span>;
  return (
    <Link
      to="/teams/$teamId"
      params={{ teamId: team.team_id }}
      className="flex min-w-0 items-center justify-center gap-2 text-center text-sm font-semibold hover:text-primary"
    >
      <TeamLogo name={team.team_name} logo={team.logo_url ?? undefined} />
      <span className="break-words">{team.team_name}</span>
    </Link>
  );
}
