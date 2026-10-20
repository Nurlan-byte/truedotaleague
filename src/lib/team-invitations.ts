import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
export type Invitation = {
  id: string;
  team_id: string;
  team_name: string;
  team_tag: string;
  invited_user_id: string;
  invited_by_name: string;
  invited_user_name: string;
  status: string;
  created_at: string;
};
export type Player = { id: string; nickname: string; mmr: number | null; role_position: string };
const errors: Record<string, string> = {
  already_in_team: "Пользователь уже состоит в команде. Сначала нужно выйти.",
  not_team_captain: "Нужны права владельца или капитана.",
  owner_required: "Доступно только владельцу.",
  owner_cannot_leave: "Владелец может только удалить команду.",
  team_full: "В составе уже 5 основных и 2 запасных игрока.",
  slot_full: "В выбранном составе нет места.",
  invitation_not_pending: "Приглашение уже обработано.",
  not_invitation_recipient: "Это приглашение адресовано другому игроку.",
  member_required: "Выберите участника состава.",
  cannot_remove_owner: "Нельзя исключить владельца.",
  "23505": "Такое ожидающее приглашение уже существует.",
};
export async function teamRpc<T>(
  name:
    | "create_team"
    | "manage_team"
    | "create_team_invitation"
    | "respond_team_invitation"
    | "list_team_invitations"
    | "search_team_players",
  args: Record<string, string | null> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(
    name,
    args as Database["public"]["Functions"][typeof name]["Args"],
  );
  if (error) throw new Error(errors[error.message] ?? errors[error.code] ?? error.message);
  return data as T;
}
export const invitationsQuery = (userId?: string, available = true) =>
  queryOptions({
    queryKey: ["league", "invitations", userId ?? "guest"],
    enabled: !!userId && available,
    refetchInterval: 30000,
    queryFn: () => teamRpc<Invitation[]>("list_team_invitations"),
  });

// Probe a dedicated version RPC; a missing RPC means the old schema is still active.
export const teamSystemQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["league", "team-system", userId ?? "guest"],
    enabled: !!userId,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_system_version");
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return false;
        throw new Error("Не удалось проверить доступность системы команд.");
      }
      return data === 1;
    },
  });
