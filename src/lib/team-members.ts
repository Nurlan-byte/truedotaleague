export function orderTeamMembers<T extends { id: string; position: number }>(members: T[]): T[] {
  return [...members].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function nextMemberPosition(members: { position: number }[]): number {
  return members.reduce((max, member) => Math.max(max, member.position), -1) + 1;
}
