import { useMemo } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import type { CatalogItem, RankingRow } from "@/lib/league-api";
import { winLoss } from "@/lib/divisions";

export function LeaderboardTable({ rows, catalog, limit }: { rows: RankingRow[]; catalog: CatalogItem[]; limit?: number }) {
  const wl = useMemo(() => winLoss(catalog.flatMap((t) => t.matches)), [catalog]);
  const list = limit ? rows.slice(0, limit) : rows;
  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Рейтинг появится после первого завершённого турнира с начислением TDL Points.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-3 text-left">#</th>
            <th className="px-2 py-3 text-left">Команда</th>
            <th className="px-2 py-3 text-right">TDL</th>
            <th className="hidden px-2 py-3 text-right sm:table-cell">Победы</th>
            <th className="hidden px-2 py-3 text-right sm:table-cell">Поражения</th>
            <th className="hidden px-3 py-3 text-right md:table-cell">Турниров</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => {
            const s = wl.get(r.teamId) ?? { wins: 0, losses: 0 };
            return (
              <tr key={r.teamId} className="border-t border-border transition-colors hover:bg-muted/60">
                <td className={`px-3 py-3 font-extrabold ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</td>
                <td className="max-w-0 px-2 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0"><TeamLogo name={r.name} logo={r.logo} /></span>
                    <span className="truncate font-semibold text-foreground">{r.name}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">{s.wins}П · {s.losses}Пр · {r.events} турн.</p>
                </td>
                <td className="px-2 py-3 text-right font-extrabold text-foreground">{r.points}</td>
                <td className="hidden px-2 py-3 text-right text-foreground sm:table-cell">{s.wins}</td>
                <td className="hidden px-2 py-3 text-right text-foreground sm:table-cell">{s.losses}</td>
                <td className="hidden px-3 py-3 text-right text-foreground md:table-cell">{r.events}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
