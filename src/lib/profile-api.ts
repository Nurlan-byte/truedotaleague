import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VerificationStatus = "unverified" | "pending" | "verified";
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  unverified: "Не верифицирован",
  pending: "На проверке",
  verified: "Верифицирован",
};
export type Verification = {
  status: VerificationStatus;
  submitted_at: string | null;
  reviewed_at?: string | null;
};
export type ProfileReview = {
  profile_id: string;
  nickname: string;
  mmr: number;
  profile_url: string;
  role_position: string;
  bio: string;
  submitted_at: string;
};
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
  if (!input.mmr.trim()) throw new Error("Укажите MMR для проверки профиля.");
  const mmr = Number(input.mmr.trim());
  if (!Number.isInteger(mmr) || mmr < 0 || mmr > 15000)
    throw new Error("MMR должен быть целым числом от 0 до 15000.");
  const url = input.profileUrl.trim();
  if (!/^https?:\/\/\S+$/i.test(url))
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

export function verificationResult(value: unknown): Verification {
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    !["unverified", "pending", "verified"].includes(String(value.status))
  ) {
    throw new Error("Не удалось получить статус проверки профиля.");
  }
  return value as Verification;
}
export function profileError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (["PGRST202", "42883", "42P01"].includes(error.code ?? ""))
    return "Проверка профилей пока недоступна. Попробуйте позже или обратитесь к администратору.";
  if (/self_review|cannot_review_own_profile/.test(message))
    return "Нельзя подтверждать собственный профиль. Нужен другой модератор или администратор.";
  if (/stale|not_pending/.test(message))
    return "Заявка уже изменилась. Обновите список перед решением.";
  if (/forbidden|staff_required/.test(message) || error.code === "42501")
    return "Недостаточно прав для проверки профиля.";
  if (/invalid|incomplete/.test(message)) return "Проверьте никнейм, MMR и ссылку на профиль.";
  return "Не удалось сохранить изменения. Обновите страницу и попробуйте снова.";
}
export const verificationQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["profile", "verification", userId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_profile_verification");
      if (error) throw new Error(profileError(error));
      return verificationResult(data);
    },
  });
export async function saveProfileForReview(input: ProfileInput) {
  const { data, error } = await supabase.rpc("save_profile_for_review", profilePayload(input));
  if (error) throw new Error(profileError(error));
  return verificationResult(data);
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
export const profileReviewsQuery = (enabled: boolean, userId?: string) =>
  queryOptions({
    queryKey: ["profile", "reviews", userId],
    enabled,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_profile_reviews");
      if (error) throw new Error(profileError(error));
      if (!Array.isArray(data)) throw new Error("Не удалось загрузить заявки на проверку.");
      return data as unknown as ProfileReview[];
    },
  });
export async function decideProfileReview(review: ProfileReview, approve: boolean) {
  const { error } = await supabase.rpc("decide_profile_review", {
    p_profile_id: review.profile_id,
    p_submitted_at: review.submitted_at,
    p_approve: approve,
  });
  if (error) throw new Error(profileError(error));
}

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
