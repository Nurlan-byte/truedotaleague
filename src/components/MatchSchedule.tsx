import {
  formatMatchTime,
  matchWinner,
  roundName,
  type GroupMatch,
  type Match,
  type Team,
} from "@/lib/tournament";
import { TeamLogo } from "@/components/TeamLogo";
import { CalendarDays, Clock } from "lucide-react";

type Props = {
  teams: Team[];
  groupMatches: GroupMatch[];
  bracket: Match[];
  /** Если передан — показываются поля выбора даты и времени матча (для админа). */
  onTime?: (id: string, value: string) => void;
};

type Row = {
  id: string;
  stage: string;
  teamA: string | null;
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  scheduledAt: string | null;
};

export function MatchSchedule({ teams, groupMatches, bracket, onTime }: Props) {
  const teamOf = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const totalRounds = bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0;


  const rows: Row[] = [
    ...groupMatches.map((m) => ({
      id: m.id,
      stage: `Группа ${m.group + 1}`,
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      scheduledAt: m.scheduledAt ?? null,
      winner:
        m.scoreA === null || m.scoreB === null || m.scoreA === m.scoreB
          ? null
          : m.scoreA > m.scoreB
            ? m.teamA
            : m.teamB,
    })),
    ...[...bracket]
      .sort((a, b) => a.round - b.round || a.order - b.order)
      .map((m) => ({
        id: m.id,
        stage: roundName(m.round, totalRounds),
        teamA: m.teamA,
        teamB: m.teamB,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        scheduledAt: m.scheduledAt ?? null,
        winner: matchWinner(m),
      })),
  ];


  if (rows.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">
          Сейчас активного турнира нет. Расписание появится, когда организатор создаст группы или
          сетку плей-офф. Результаты прошедших турниров — в разделе «Турниры лиги».
        </p>
      </div>
    );
  }

  const played = rows.filter((r) => r.scoreA !== null && r.scoreB !== null).length;

  return (
    <div className="panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-2xl text-foreground">
        <CalendarDays className="size-5 text-primary" /> Расписание матчей
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {played}/{rows.length} сыграно
        </span>
      </h2>

      <ul className="space-y-2">
        {rows.map((r) => {
          const done = r.scoreA !== null && r.scoreB !== null;
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-white/50 px-3 py-2"
            >
              <span className="w-24 shrink-0 truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {r.stage}
              </span>
              <span
                className={`flex min-w-0 flex-1 items-center justify-end gap-2 text-sm ${
                  r.winner && r.winner === r.teamA ? "font-bold text-win" : "text-foreground"
                }`}
              >
                <span className="truncate">{teamOf(r.teamA)?.name ?? "Ожидание"}</span>
                {r.teamA && <TeamLogo name={teamOf(r.teamA)?.name ?? ""} logo={teamOf(r.teamA)?.logo} />}
              </span>
              <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                {done ? `${r.scoreA} : ${r.scoreB}` : "—"}
              </span>
              <span
                className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${
                  r.winner && r.winner === r.teamB ? "font-bold text-win" : "text-foreground"
                }`}
              >
                {r.teamB && <TeamLogo name={teamOf(r.teamB)?.name ?? ""} logo={teamOf(r.teamB)?.logo} />}
                <span className="truncate">{teamOf(r.teamB)?.name ?? "Ожидание"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
