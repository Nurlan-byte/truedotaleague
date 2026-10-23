import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProfileInput = {
  nickname: string;
  mmr: string;
  profileUrl: string;
  position: string;
  bio: string;
  lookingForTeam: boolean;
};

export function profilePayload(input: ProfileInput) {
  const nickname = input.nickname.trim();
  if (nickname.length < 2 || nickname.length > 32)
    throw new Error("Никнейм должен быть от 2 до 32 символов.");
  const mmr = input.mmr.trim() ? Number(input.mmr.trim()) : null;
  if (mmr !== null && (!Number.isInteger(mmr) || mmr < 0 || mmr > 15000))
    throw new Error("MMR должен быть целым числом от 0 до 15000.");
  const url = input.profileUrl.trim();
  if (url && !/^https?:\/\/[^\s/?#]+[^\s]*$/i.test(url))
    throw new Error("Укажите ссылку на профиль, начинающуюся с http:// или https://.");
  if (input.bio.trim().length > 500)
    throw new Error("Описание не может быть длиннее 500 символов.");
  return {
    p_nickname: nickname,
    p_mmr: mmr,
    p_profile_url: url,
    p_role_position: input.position,
    p_bio: input.bio.trim(),
    p_looking_for_team: input.lookingForTeam,
  };
}

export function profileError(error: { code?: string; message?: string }) {
  if (["PGRST202", "42883", "42P01"].includes(error.code ?? ""))
    return "Сохранение профиля пока недоступно. Попробуйте позже.";
  if (/forbidden|not_authenticated/.test(error.message ?? "") || error.code === "42501")
    return "Войдите в свой аккаунт, чтобы сохранить профиль.";
  if (/invalid|incomplete/.test(error.message ?? ""))
    return "Проверьте никнейм, MMR и ссылку на профиль.";
  return "Не удалось сохранить изменения. Обновите страницу и попробуйте снова.";
}
export async function saveProfile(input: ProfileInput) {
  // Keep the deployed RPC signature; the follow-up migration makes this a plain self-save.
  const { error } = await supabase.rpc("save_profile_for_review", profilePayload(input));
  if (error) throw new Error(profileError(error));
}
export const ownRoleQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["profile", "role", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return data?.some((r) => r.role === "admin")
        ? "admin"
        : data?.some((r) => r.role === "moderator")
          ? "moderator"
          : "user";
    },
  });
export type ProfileTeam = {
  id: string;
  name: string;
  tag: string;
  owner_id: string;
  team_members: { profile_id: string | null }[];
};
export function teamsForProfile(teams: ProfileTeam[], profileId: string) {
  return teams.filter(
    (team) =>
      team.owner_id === profileId ||
      team.team_members.some((member) => member.profile_id === profileId),
  );
}
export async function fetchProfileTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, tag, owner_id, team_members!team_members_team_id_fkey(profile_id)")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}
