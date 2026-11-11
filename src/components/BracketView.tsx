import { isDouble, matchWinner, stageName, type Match, type Team } from "@/lib/tournament";
import { TeamLogo } from "@/components/TeamLogo";
import { Trophy } from "lucide-react";

type Props = {
  /** Команды пользователя — их матчи подсвечиваются. */
  highlight?: string[];
  matches: Match[];
  teams: Team[];
  onScore?: (id: string, side: "A" | "B", value: string) => void;
  readOnly?: boolean;
};

export function BracketView({ matches, teams, onScore, readOnly = false, highlight = [] }: Props) {
  if (matches.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">
          Добавьте минимум 2 команды и сгенерируйте сетку.
        </p>
      </div>
    );
  }

  const teamOf = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const nameOf = (id: string | null) => (id ? (teamOf(id)?.name ?? "—") : null);
  const double = isDouble(matches);
  const final = double
    ? matches.find((m) => m.bracket === "grand")
    : matches.find((m) => m.round === Math.max(...matches.map((x) => x.round)));
  const championTeam = final ? teamOf(matchWinner(final)) : undefined;
  const sections = double
    ? ([
        ["Верхняя сетка", matches.filter((m) => (m.bracket ?? "upper") === "upper")],
        ["Нижняя сетка", matches.filter((m) => m.bracket === "lower")],
        ["Гранд-финал", matches.filter((m) => m.bracket === "grand")],
      ] as const)
    : ([["", matches]] as const);

  return (
    <div className="space-y-6">
      {championTeam && (
        <div className="panel glow flex items-center gap-3 px-5 py-4">
          <Trophy className="size-6 text-accent" />
          <TeamLogo name={championTeam.name} logo={championTeam.logo} size="lg" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Чемпион</p>
            <p className="font-display text-2xl text-foreground">{championTeam.name}</p>
          </div>
        </div>
      )}

      {sections.map(([title, list]) => (
        <div key={title} className="space-y-2">
          {title && <h3 className="text-sm font-bold uppercase tracking-widest text-primary">{title}</h3>}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {[...new Set(list.map((m) => m.round))].sort((x, y) => x - y).map((round) => {
            const rms = list
              .filter((m) => m.round === round)
              .sort((a, b) => a.order - b.order);
            return (
              <div key={round} className="flex w-64 flex-col justify-around gap-4">
                <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {stageName(rms[0], matches)}
                </p>
                {rms.map((m) => {
                  const winner = matchWinner(m);
                  return (
                    <div key={m.id} className={`panel overflow-hidden ${highlight.some((h) => h === m.teamA || h === m.teamB) ? "ring-2 ring-primary" : ""}`}>
                      {(["A", "B"] as const).map((side) => {
                        const teamId = side === "A" ? m.teamA : m.teamB;
                        const score = side === "A" ? m.scoreA : m.scoreB;
                        const isWinner = !!winner && winner === teamId;
                        return (
                          <div
                            key={side}
                            className={`flex items-center gap-2 border-border px-3 py-2 ${
                              side === "A" ? "border-b" : ""
                            } ${isWinner ? "bg-win/15" : "bg-white/40"}`}
                          >
                            {teamId && (
                              <TeamLogo name={nameOf(teamId) ?? ""} logo={teamOf(teamId)?.logo} />
                            )}
                            <span
                              className={`flex-1 truncate text-sm ${
                                teamId
                                  ? isWinner
                                    ? "font-bold text-win"
                                    : "text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {nameOf(teamId) ?? "Ожидание"}
                            </span>
                            {readOnly ? (
                              <span className="w-10 text-center text-sm font-bold text-foreground">
                                {score ?? "—"}
                              </span>
                            ) : (
                              <input
                                inputMode="numeric"
                                disabled={!teamId}
                                value={score ?? ""}
                                onChange={(e) => onScore?.(m.id, side, e.target.value)}
                                className="w-10 rounded-md border border-input bg-white/80 px-1 py-0.5 text-center text-sm text-foreground outline-none focus:border-primary disabled:opacity-40"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
        </div>
      ))}
    </div>
  );
}
