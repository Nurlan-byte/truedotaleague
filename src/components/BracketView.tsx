import { matchWinner, roundName, type Match, type Team } from "@/lib/tournament";
import { Trophy } from "lucide-react";

type Props = {
  matches: Match[];
  teams: Team[];
  onScore: (id: string, side: "A" | "B", value: string) => void;
};

export function BracketView({ matches, teams, onScore }: Props) {
  if (matches.length === 0) {
    return (
      <div className="panel p-5">
        <p className="text-sm text-muted-foreground">
          Добавьте минимум 2 команды и сгенерируйте сетку.
        </p>
      </div>
    );
  }

  const nameOf = (id: string | null) =>
    id ? (teams.find((t) => t.id === id)?.name ?? "—") : null;
  const totalRounds = Math.max(...matches.map((m) => m.round));
  const champion = nameOf(matchWinner(matches.find((m) => m.round === totalRounds)!));

  return (
    <div className="space-y-6">
      {champion && (
        <div className="panel glow flex items-center gap-3 px-5 py-4">
          <Trophy className="size-6 text-accent" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Чемпион</p>
            <p className="font-display text-2xl text-foreground">{champion}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-6">
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
            const rms = matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.order - b.order);
            return (
              <div key={round} className="flex w-64 flex-col justify-around gap-4">
                <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {roundName(round, totalRounds)}
                </p>
                {rms.map((m) => {
                  const winner = matchWinner(m);
                  return (
                    <div key={m.id} className="panel overflow-hidden">
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
                            <input
                              inputMode="numeric"
                              disabled={!teamId}
                              value={score ?? ""}
                              onChange={(e) => onScore(m.id, side, e.target.value)}
                              className="w-10 rounded-md border border-input bg-white/80 px-1 py-0.5 text-center text-sm text-foreground outline-none focus:border-primary disabled:opacity-40"
                            />
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
  );
}
