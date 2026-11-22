import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { matchWinner, stageName, type Match, type Team } from "@/lib/tournament";
import { layoutBracket, MATCH_HEIGHT, MATCH_WIDTH } from "@/lib/bracket-layout";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, RotateCcw, Trophy, ZoomIn, ZoomOut } from "lucide-react";

const COLUMN_WIDTH = MATCH_WIDTH + 44;

type Props = {
  highlight?: string[];
  matches: Match[];
  teams: Team[];
  onScore?: (id: string, side: "A" | "B", value: string) => void;
  readOnly?: boolean;
  onEditMatch?: (id: string) => void;
};

export function BracketView({ matches, teams, onScore, readOnly = false, highlight = [], onEditMatch }: Props) {
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  if (!matches.length) return <p className="text-sm text-muted-foreground">Сетка ещё не опубликована.</p>;
  const layout = layoutBracket(matches);
  const teamOf = (id: string | null) => teams.find((t) => t.id === id);
  const final = matches.find((m) => m.bracket === "grand") ?? matches.filter((m) => (m.bracket ?? "upper") === "upper").sort((a, b) => b.round - a.round)[0];
  const champion = final ? teamOf(matchWinner(final)) : undefined;
  const phase = (m: Match) => m.bracket === "grand" ? Infinity : m.bracket === "lower" ? m.round + 0.5 : m.round === 1 ? 0 : 2 * m.round - 2;
  const numbered = [...matches].sort((a, b) => phase(a) - phase(b) || a.order - b.order);
  const numbers = new Map(numbered.map((m, index) => [m.id, index + 1]));
  const seeds = new Map(teams.map((team, index) => [team.id, index + 1]));
  const heading = (m: Match) => m.bracket === "grand" ? "Финал" : m.bracket === "lower" ? `Раунд нижней сетки ${m.round}` : matches.some((match) => match.bracket === "grand") ? (m.round === Math.max(...matches.filter((match) => (match.bracket ?? "upper") === "upper").map((match) => match.round)) ? "Полуфиналы" : `Раунд ${m.round}`) : stageName(m, matches);
  const placeholder = (match: Match, side: "A" | "B") => {
    const feeder = layout.edges.find((e) => e.to.match.id === match.id && e.side === side);
    if (feeder) return `${feeder.loser ? "Проигравший" : "Победитель"} матча ${numbers.get(feeder.from.match.id)}`;
    return (match.bracket ?? "upper") === "lower" ? "Из верхней сетки" : match.round === 1 ? "Свободный слот" : "Ожидание соперника";
  };

  return (
    <div className={expanded ? "fixed inset-0 z-50 flex flex-col bg-background p-3 sm:p-6" : "min-w-0"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {champion ? <><Trophy className="size-4 shrink-0 text-gold" /><span className="truncate">{champion.name}</span></> : <span className="text-muted-foreground">{matches.length} матчей</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" title="Уменьшить" aria-label="Уменьшить сетку" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}><ZoomOut /></Button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" title="Увеличить" aria-label="Увеличить сетку" disabled={zoom >= 1.5} onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}><ZoomIn /></Button>
          <Button variant="ghost" size="icon" title="Исходный масштаб" aria-label="Сбросить масштаб" onClick={() => { setZoom(1); scrollRef.current?.scrollTo({ left: 0, top: 0 }); }}><RotateCcw /></Button>
          <Button variant="ghost" size="icon" title={expanded ? "Свернуть" : "Развернуть"} aria-label={expanded ? "Свернуть сетку" : "Развернуть сетку"} onClick={() => setExpanded((v) => !v)}>{expanded ? <Minimize /> : <Maximize />}</Button>
        </div>
      </div>
      <div ref={scrollRef} role="region" aria-label="Турнирная сетка" tabIndex={0}
        className={`bracket-scroll challonge-bracket min-w-0 overflow-auto ${expanded ? "flex-1" : "max-h-[720px]"}`}
        onKeyDown={(e) => { if (e.key === "Escape") setExpanded(false); }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("a,input,button")) return;
          const el = e.currentTarget;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { const d = drag.current; if (d) { e.currentTarget.scrollLeft = d.left - e.clientX + d.x; e.currentTarget.scrollTop = d.top - e.clientY + d.y; } }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="relative m-5" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
            <svg className="bracket-connectors pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.filter((edge) => !edge.loser).map(({ from, to, side }) => {
                const x = from.x + MATCH_WIDTH;
                const y = from.y + MATCH_HEIGHT / 2;
                const targetY = to.y + (side === "A" ? MATCH_HEIGHT / 4 : MATCH_HEIGHT * 3 / 4);
                const bend = to.x - 12;
                return <path key={`${from.match.id}-${to.match.id}`} d={`M ${x} ${y} H ${bend} V ${targetY} H ${to.x}`} fill="none" stroke="currentColor" strokeWidth="1.5" />;
              })}
            </svg>
            {layout.headings.map(({ x, y, match }) => <h3 key={`heading-${match.id}`} className="bracket-heading absolute flex h-6 items-center justify-center text-xs font-medium" style={{ left: x, top: y, width: COLUMN_WIDTH }}>{heading(match)}</h3>)}
            {layout.nodes.map(({ match: m, x, y }) => {
              const winner = matchWinner(m);
              return <div key={m.id} className="absolute" style={{ left: x, top: y, width: MATCH_WIDTH }}>
                <span className="bracket-match-number absolute -left-4 top-3 text-[10px] tabular-nums">{numbers.get(m.id)}</span>
                <div className={`bracket-match overflow-hidden rounded-[2px] ${highlight.some((h) => h === m.teamA || h === m.teamB) ? "ring-1 ring-primary" : ""}`}>
                  {(["A", "B"] as const).map((side) => {
                    const id = side === "A" ? m.teamA : m.teamB;
                    const score = side === "A" ? m.scoreA : m.scoreB;
                    const team = teamOf(id);
                    const won = !!id && winner === id;
                    const name = team?.name ?? (id ? "Команда" : placeholder(m, side));
                    const scoreClass = `bracket-score flex h-full w-7 shrink-0 items-center justify-center rounded-none p-0 text-xs font-medium tabular-nums ${won ? "bracket-score-winner" : ""}`;
                    return <div key={side} className={`bracket-row flex h-[22px] items-center ${side === "A" ? "bracket-row-first" : ""}`}>
                      <span className="bracket-seed flex h-full w-6 shrink-0 items-center justify-center text-[10px] tabular-nums">{id ? seeds.get(id) : ""}</span>
                      {id ? <Link to="/teams/$teamId" params={{ teamId: team?.rosterId ?? id }} className="bracket-team min-w-0 flex-1 truncate px-1.5 text-xs" title={name}>{name}</Link> : <div className="bracket-placeholder min-w-0 flex-1 truncate px-1.5 text-[10px] italic" title={name}>{name}</div>}
                      {onEditMatch && m.teamA && m.teamB ? <Button variant="ghost" aria-label={`Результат матча ${numbers.get(m.id)}: ${name}`} title="Ввести результат матча" onClick={() => onEditMatch(m.id)} className={scoreClass}>{score ?? ""}</Button> : readOnly ? <span className={scoreClass}>{score ?? ""}</span> : <input aria-label={`${name}: счёт`} inputMode="numeric" disabled={!id} value={score ?? ""} onChange={(e) => onScore?.(m.id, side, e.target.value)} className={`${scoreClass} border-0 text-center outline-none disabled:opacity-40`} />}
                    </div>;
                  })}
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}