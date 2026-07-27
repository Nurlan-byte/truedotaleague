import { standings, type GroupMatch, type Team } from "@/lib/tournament";

type Props = {
  groups: Team[][];
  matches: GroupMatch[];
  onScore: (id: string, side: "A" | "B", value: string) => void;
};

export function GroupStage({ groups, matches, onScore }: Props) {
  if (groups.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">
          Создайте группы, чтобы ввести результаты матчей и увидеть таблицы.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {groups.map((group, gi) => {
        const groupMatches = matches.filter((m) => m.group === gi);
        const table = standings(group, groupMatches);

        return (
          <div key={gi} className="panel p-5">
            <h3 className="mb-3 text-2xl text-foreground">Группа {gi + 1}</h3>

            <div className="mb-5 overflow-hidden rounded-lg border border-border bg-white/50">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-secondary-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Команда</th>
                    <th className="px-3 py-2 text-center">И</th>
                    <th className="px-3 py-2 text-center">О</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, idx) => (
                    <tr
                      key={row.teamId}
                      className={`border-b border-border last:border-b-0 ${
                        idx < 2 ? "bg-win/10" : "bg-transparent"
                      }`}
                    >
                      <td className="px-3 py-2 font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {group.find((t) => t.id === row.teamId)?.name}
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{row.played}</td>
                      <td className="px-3 py-2 text-center font-bold text-foreground">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              {groupMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-white/50 px-3 py-2"
                >
                  <span className="flex-1 truncate text-sm text-foreground">
                    {group.find((t) => t.id === m.teamA)?.name}
                  </span>
                  <input
                    inputMode="numeric"
                    value={m.scoreA ?? ""}
                    onChange={(e) => onScore(m.id, "A", e.target.value)}
                    className="w-11 rounded-md border border-input bg-white/80 px-1 py-1 text-center text-sm text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-xs font-bold text-muted-foreground">:</span>
                  <input
                    inputMode="numeric"
                    value={m.scoreB ?? ""}
                    onChange={(e) => onScore(m.id, "B", e.target.value)}
                    className="w-11 rounded-md border border-input bg-white/80 px-1 py-1 text-center text-sm text-foreground outline-none focus:border-primary"
                  />
                  <span className="flex-1 truncate text-right text-sm text-foreground">
                    {group.find((t) => t.id === m.teamB)?.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
