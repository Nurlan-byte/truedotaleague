type Member = { profile_id: string | null; position: number };

// Ownership alone and outstanding invitations are not roster membership.
export function applicationRoster(members: readonly Member[]) {
  const main = members.filter((m) => m.profile_id && Number.isInteger(m.position) && m.position >= 0 && m.position < 5);
  const count = new Set(main.map((m) => m.profile_id)).size;
  const slots = new Set(main.map((m) => m.position)).size;
  return { count, ready: count >= 5 && slots === 5 };
}
