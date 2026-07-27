import { standings, type GroupMatch, type Team } from "@/lib/tournament";

type Props = {
  groups: Team[][];
  matches: GroupMatch[];
  onScore: (id: string, side: "A" | "B", value: string) => void;
};

export function GroupStage({ groups, matches, onScore }: Props) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Сгенерируйте групповой этап, чтобы увидеть таблицы и матчи.
      </p>
    );
  }

  const nameOf = (id: string) =>
    groups.flat().find((t) => t.id === id)?.name ?? "—";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map((group, gi) => {
        const gm = matches.filter((m) => m.group === gi);
        const table = standings(group, gm);
        return (
          <section key={gi} className="panel p-4">
            <h3 className="mb-3 text-xl">Группа {String.fromCharCode(65 + gi)}</h3>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Команда</th>
                  <th className="pb-2 font-medium">И</th>
                  <th className="pb-2 font-medium">В</th>
                  <th className="pb-2 font-medium">Н</th>
                  <th className="pb-2 font-medium">П</th>
                  <th className="pb-2 font-medium">Разн.</th>
                  <th className="pb-2 font-medium">О</th>
                </tr>
              </thead>
              <tbody>
                {table.map((s, i) => (
                  <tr key={s.teamId} className="border-t border-border">
                    <td className="py-1.5 text-left">
                      <span className="mr-2 text-xs text-muted-foreground">{i + 1}</span>
                      <span className={i < 2 ? "font-semibold text-primary" : ""}>
                        {nameOf(s.teamId)}
                      </span>
                    </td>
                    <td className="text-center">{s.played}</td>
                    <td className="text-center">{s.wins}</td>
                    <td className="text-center">{s.draws}</td>
                    <td className="text-center">{s.losses}</td>
                    <td className="text-center">{s.scored - s.conceded}</td>
                    <td className="text-center font-semibold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-2">
              {gm.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5 text-sm"
                >
                  <span className="flex-1 truncate text-right">{nameOf(m.teamA)}</span>
                  <input
                    inputMode="numeric"
                    value={m.scoreA ?? ""}
                    onChange={(e) => onScore(m.id, "A", e.target.value)}
                    className="w-9 rounded-md border border-input bg-background/60 px-1 py-0.5 text-center outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">:</span>
                  <input
                    inputMode="numeric"
                    value={m.scoreB ?? ""}
                    onChange={(e) => onScore(m.id, "B", e.target.value)}
                    className="w-9 rounded-md border border-input bg-background/60 px-1 py-0.5 text-center outline-none focus:border-primary"
                  />
                  <span className="flex-1 truncate">{nameOf(m.teamB)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
