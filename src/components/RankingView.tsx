import { Trophy } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import type { RankingRow } from "@/lib/league-api";

const placeColor = (place: number) =>
  place === 1 ? "text-accent" : place === 2 ? "text-primary" : place === 3 ? "text-win" : "text-muted-foreground";

export function RankingView({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">Пока нет завершённых турниров с начисленными TDL points.</p>
        <p className="mt-2 text-xs text-muted-foreground">
          1 место — 50 TDL · 2 место — 25 TDL · 3 место — 12 TDL · 4 место — 6 TDL.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <h3 className="mb-3 flex items-center gap-2 text-2xl text-foreground">
        <Trophy className="size-5 text-accent" /> Рейтинг команд
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border bg-white/50">
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
              <tr key={r.teamId} className="border-b border-border last:border-b-0">
                <td className={`px-3 py-2 font-bold ${placeColor(i + 1)}`}>{i + 1}</td>
                <td className="px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                    <TeamLogo name={r.name} logo={r.logo} />
                    <span className="truncate">{r.name}</span>
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
      <p className="mt-3 text-xs text-muted-foreground">
        Очки считаются по команде, а не по названию: переименование не создаёт новую строку.
      </p>
    </div>
  );
}
