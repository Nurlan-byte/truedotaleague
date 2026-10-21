import { queryOptions } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Invitation = {
  id: string;
  team_id: string;
  team_name: string;
  team_tag: string;
  invited_user_id: string;
  invited_user_name: string;
  invited_by_name: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
};
export type Player = { id: string; nickname: string; mmr: number | null };
const errors: Record<string, string> = {
  already_in_team: "Пользователь уже состоит в команде или владеет ею.",
  owner_required: "Это действие доступно только капитану — создателю команды.",
  not_team_owner: "Это действие доступно только капитану — создателю команды.",
  not_authenticated: "Войдите в аккаунт.",
  profile_required: "Сначала заполните профиль игрока.",
  team_not_found: "Команда не найдена. Обновите страницу.",
  not_in_team: "Вы уже не состоите в этой команде.",
  member_required: "Выберите участника этой команды.",
  team_has_history: "Команду нельзя удалить: у неё есть заявки или история участия в турнирах.",
  teams_unique_tag: "Этот тег уже занят другой командой.",
  teams_single_owner: "Вы уже создали команду. Вторую команду создать нельзя.",
  team_members_single_team: "Пользователь уже состоит в команде.",
  team_invites_pending_unique: "Этому игроку уже отправлено приглашение в вашу команду.",
  team_full: "В составе уже 5 основных и 2 запасных игрока.",
  invitation_not_pending: "На это приглашение уже ответили или его отменили.",
  invite_not_pending: "На это приглашение уже ответили или его отменили.",
  not_invitation_recipient: "Приглашение адресовано другому игроку.",
  not_invite_recipient: "Приглашение адресовано другому игроку.",
  invitation_not_found: "Приглашение не найдено.",
  invite_not_found: "Приглашение не найдено.",
  invalid_team_name_or_tag: "Укажите название до 100 символов и тег до 8 символов.",
  invalid_tag: "Укажите тег команды до 8 символов.",
  cannot_remove_owner: "Нельзя исключить создателя команды.",
  owner_cannot_leave: "Капитан не может покинуть свою команду.",
  "23505": "Команда с таким тегом, членство или ожидающее приглашение уже существуют.",
  "23503": "Действие недоступно: запись связана с участием в команде или турнире.",
  "42501": "Недостаточно прав для этого действия.",
};
export function teamErrorText(error: { message?: string; code?: string }): string {
  const key = Object.keys(errors).find((value) => error.message?.includes(value));
  return (
    (key && errors[key]) ||
    errors[error.code ?? ""] ||
    "Не удалось выполнить действие. Обновите страницу и попробуйте снова."
  );
}
type TeamRpcName =
  | "create_team"
  | "invite_player"
  | "accept_invite"
  | "decline_invite"
  | "cancel_invite"
  | "manage_team"
  | "search_team_players"
  | "list_team_invites";
export async function teamRpc<T = unknown>(
  name: TeamRpcName,
  args: Record<string, string | null> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(
    name,
    args as Database["public"]["Functions"][typeof name]["Args"],
  );
  if (error) throw new Error(teamErrorText(error));
  return data as T;
}
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
      return data === 2;
    },
  });
export const invitationsQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["league", "invitations", userId ?? "guest"],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: () => teamRpc<Invitation[]>("list_team_invites"),
  });
