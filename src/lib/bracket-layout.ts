import { isDouble, type Match } from "./tournament";

export const MATCH_WIDTH = 200;
export const MATCH_HEIGHT = 44;
const COLUMN = 244;
const STEP = 64;
export type BracketNode = { match: Match; x: number; y: number };
export type BracketEdge = { from: BracketNode; to: BracketNode; side: "A" | "B"; loser?: boolean };

/** Display geometry only; never alters scores, participants or propagation. */
export function layoutBracket(matches: Match[]) {
  const nodes: BracketNode[] = [];
  const edges: BracketEdge[] = [];
  const headings: { x: number; y: number; match: Match }[] = [];
  let sectionY = 40;
  let maxColumns = 0;
  const double = isDouble(matches);
  for (const bracket of ["upper", "lower"] as const) {
    const list = matches.filter((m) => (m.bracket ?? "upper") === bracket);
    const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
    let previous: BracketNode[] = [];
    let bottom = sectionY;
    rounds.forEach((round, column) => {
      const current = list.filter((m) => m.round === round).sort((a, b) => a.order - b.order);
      const first = current[0];
      if (first) headings.push({ x: column * COLUMN, y: sectionY - 36, match: first });
      const next = current.map((match, index) => {
        const feeders = previous.length === current.length
          ? previous.slice(index, index + 1)
          : previous.slice(index * 2, index * 2 + 2);
        const y = feeders.length ? feeders.reduce((sum, n) => sum + n.y, 0) / feeders.length : sectionY + index * STEP;
        const node = { match, x: column * COLUMN, y };
        feeders.forEach((from, side) => edges.push({ from, to: node, side: side === 0 ? "A" : "B" }));
        nodes.push(node);
        bottom = Math.max(bottom, y + MATCH_HEIGHT);
        return node;
      });
      previous = next;
    });
    if (list.length) sectionY = bottom + 76;
    maxColumns = Math.max(maxColumns, rounds.length);
  }
  const grand = matches.find((m) => m.bracket === "grand");
  if (double && grand) {
    const finals = ["upper", "lower"].map((b) => nodes.filter((n) => (n.match.bracket ?? "upper") === b).sort((a, b) => b.match.round - a.match.round)[0]).filter((n): n is BracketNode => !!n);
    const upperFinal = finals.find((n) => (n.match.bracket ?? "upper") === "upper");
    const node = { match: grand, x: maxColumns * COLUMN, y: (upperFinal?.y ?? 40) + STEP / 2 };
    nodes.push(node);
    headings.push({ x: node.x, y: 4, match: grand });
    finals.forEach((from, i) => edges.push({ from, to: node, side: i === 0 ? "A" : "B" }));
    maxColumns++;
  }
  // Official brackets use stored links, not inferred neighbouring rounds.
  // Legacy/local brackets have no links and retain their existing fallback.
  if (matches.some((m) => m.nextMatchId !== undefined)) {
    edges.length = 0;
    const byId = new Map(nodes.map((n) => [n.match.id, n]));
    for (const from of nodes) {
      for (const [id, slot, loser] of [
        [from.match.nextMatchId, from.match.nextMatchSlot, false],
        [from.match.loserNextMatchId, from.match.loserNextMatchSlot, true],
      ] as const) {
        const to = id ? byId.get(id) : undefined;
        if (to && (slot === "a" || slot === "b")) edges.push({ from, to, side: slot === "a" ? "A" : "B", loser });
      }
    }
  }
  return { nodes, edges, headings, width: Math.max(MATCH_WIDTH, maxColumns * COLUMN - (COLUMN - MATCH_WIDTH)), height: Math.max(160, ...nodes.map((n) => n.y + MATCH_HEIGHT + 24)) };
}