import { Crown, Medal, Trophy } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { leaderboard, type TournamentRecord } from "@/lib/tournament";

type Props = { history: TournamentRecord[] };

const placeColor = (place: number) =>
  place === 1
    ? "text-accent"
    : place === 2
      ? "text-primary"
      : place === 3
        ? "text-win"
        : "text-muted-foreground";

export function RankingView({ history }: Props) {
  const rows = leaderboard(history);

  if (history.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">
          Пока нет завершённых турниров. Доиграйте плей-офф до финала и нажмите «Завершить турнир»,
          чтобы начислить TDL points.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          1 место — 50 TDL · 2 место — 25 TDL · 3 место — 12 TDL · 4 место — 6 TDL. Остальные команды
          ждут следующего турнира.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <h3 className="mb-3 flex items-center gap-2 text-2xl text-foreground">
          <Trophy className="size-5 text-accent" /> Рейтинг команд
        </h3>
        <div className="overflow-hidden rounded-lg border border-border bg-white/50">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Команда</th>
                <th className="px-3 py-2 text-center">Турниров</th>
                <th className="px-3 py-2 text-center">Титулов</th>
                <th className="px-3 py-2 text-center">TDL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.teamName} className="border-b border-border last:border-b-0">
                  <td className={`px-3 py-2 font-bold ${placeColor(i + 1)}`}>{i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <TeamLogo name={r.teamName} logo={r.logo} />
                      {r.teamName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{r.events}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{r.titles}</td>
                  <td className="px-3 py-2 text-center font-bold text-foreground">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="mb-3 flex items-center gap-2 text-2xl text-foreground">
          <Crown className="size-5 text-accent" /> Чемпионы турниров
        </h3>
        <ol className="space-y-3">
          {history.map((t, i) => (
            <li key={t.id} className="rounded-lg border border-border bg-white/50 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-foreground">
                  {history.length - i}-й турнир — {t.title}
                </p>
                <p className="text-xs text-muted-foreground">{t.date}</p>
              </div>
              <ul className="space-y-1.5">
                {t.placements.map((p) => (
                  <li key={p.place} className="flex items-center gap-2 text-sm">
                    <Medal className={`size-4 ${placeColor(p.place)}`} />
                    <span className="w-6 font-bold text-muted-foreground">{p.place}</span>
                    <TeamLogo name={p.teamName} logo={p.logo} />
                    <span className="flex-1 truncate text-foreground">{p.teamName}</span>
                    <span className="font-bold text-foreground">+{p.points} TDL</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
