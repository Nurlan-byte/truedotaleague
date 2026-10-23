import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { teamErrorText } from "@/lib/team-invitations";

export type InviteLinkPreview = {
  team_id?: string;
  name?: string;
  tag?: string;
  logo_url?: string | null;
  status: "pending" | "accepted" | "revoked" | "unavailable";
};
export type TeamInviteLink = { id: string; status: string; created_at: string };
type LinkRpc = "create_team_invite_link" | "list_team_invite_links" | "revoke_team_invite_link" | "preview_team_invite_link" | "accept_team_invite_link";
export function validInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
export function inviteReturnPath(token: string) {
  if (!validInviteToken(token)) throw new Error("Недействительная ссылка приглашения.");
  return `/join?token=${token}`;
}
export function inviteLoginHref(token: string) {
  return `/auth?next=${encodeURIComponent(inviteReturnPath(token))}`;
}
export function inviteLinkError(error: { code?: string; message?: string }) {
  if (["PGRST202", "42883", "42P01"].includes(error.code ?? ""))
    return "Приглашения по ссылке пока недоступны. Попробуйте позже.";
  if (/link_not_found|invalid_link|invalid_token|invite_link_invalid|invitation_link_unavailable/.test(error.message ?? ""))
    return "Ссылка приглашения недействительна. Попросите капитана прислать новую.";
  if (/link_revoked|link_not_pending|link_already_used|invite_link_unavailable|invitation_link_used/.test(error.message ?? ""))
    return "Ссылка уже использована или отозвана. Попросите капитана прислать новую.";
  return teamErrorText(error);
}
export async function inviteLinkRpc<T>(name: LinkRpc, args: Record<string, string> = {}): Promise<T> {
  // Additive RPCs: this boundary remains fail-closed before the migration is deployed.
  const client = supabase as unknown as { rpc: (name: LinkRpc, args: Record<string, string>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(inviteLinkError(error));
  return data as T;
}
export const teamInviteLinksQuery = (teamId: string) => queryOptions({
  queryKey: ["league", "team-invite-links", teamId],
  queryFn: () => inviteLinkRpc<TeamInviteLink[]>("list_team_invite_links", { p_team_id: teamId }),
});
export const inviteLinkPreviewQuery = (token: string) => queryOptions({
  queryKey: ["league", "invite-link-preview", token],
  enabled: validInviteToken(token),
  retry: false,
  queryFn: () => inviteLinkRpc<InviteLinkPreview>("preview_team_invite_link", { p_token: token }),
});
export async function inviteDismissalKey(token: string, userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `tdl:declined-invite:${userId}:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
}
