/** A row's position within its table stays stable when the page scrolls. */
export function rowTopInTable(rowViewportTop: number, tableViewportTop: number): number {
  return rowViewportTop - tableViewportTop;
}

export function rowMovement(before: number, after: number): number {
  return before - after;
}
