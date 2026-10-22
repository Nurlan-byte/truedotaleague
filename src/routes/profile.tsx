import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { myTeamsQuery } from "@/lib/league-api";
import {
  ownRoleQuery,
  saveProfileForReview,
  verificationQuery,
  VERIFICATION_LABEL,
} from "@/lib/profile-api";
import { ArrowLeft, ImagePlus, Save, Trophy, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import { fileToLogoDataUrl, validateLogoFile } from "@/lib/image";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Профиль игрока — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Личный профиль игрока TrueDotaLeague: никнейм, рейтинг MMR, роль на линии, описание о себе и ссылка на Dotabuby/Steam.",
      },
      { property: "og:title", content: "Профиль игрока — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Заполните никнейм, MMR, позицию и расскажите о себе другим игрокам лиги.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

const POSITIONS = ["Керри (1)", "Мид (2)", "Хардлайн (3)", "Роумер (4)", "Саппорт (5)"];

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const teams = useQuery(myTeamsQuery(user?.id));
  const verification = useQuery(verificationQuery(user?.id));
  const ownRole = useQuery(ownRoleQuery(user?.id));
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [discord, setDiscord] = useState<{ id: string; username: string; name: string } | null>(
    null,
  );
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [mmr, setMmr] = useState("");
  const [position, setPosition] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [lookingForTeam, setLookingForTeam] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfileLoaded(false);
    if (!user) return;
    let active = true;
    supabase
      .from("profiles")
      .select("nickname, bio, mmr, role_position, profile_url, avatar_url, looking_for_team")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError || !data) {
          setError("Не удалось загрузить профиль. Обновите страницу.");
          return;
        }
        setProfileLoaded(true);
        setNickname(data.nickname ?? "");
        setBio(data.bio ?? "");
        setMmr(data.mmr === null || data.mmr === undefined ? "" : String(data.mmr));
        setPosition(data.role_position ?? "");
        setProfileUrl(data.profile_url ?? "");
        setAvatarUrl(data.avatar_url ?? null);
        setLookingForTeam(Boolean(data.looking_for_team));
      });
    supabase.rpc("get_my_discord_identity").then(({ data, error: identityError }) => {
      if (!active) return;
      if (identityError) {
        setError("Не удалось загрузить привязку Discord. Обновите страницу.");
        return;
      }
      const identity = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      const id = identity?.discord_id;
      setDiscord(
        typeof id === "string" && id
          ? {
              id,
              username:
                typeof identity?.discord_username === "string" ? identity.discord_username : "",
              name:
                typeof identity?.discord_global_name === "string"
                  ? identity.discord_global_name
                  : "",
            }
          : null,
      );
    });
    return () => {
      active = false;
    };
  }, [user]);

  const saveAvatar = async (value: string | null) => {
    if (!user) return;
    setError(null);
    setStatus(null);
    const { error: dbError } = await supabase
      .from("profiles")
      .update({ avatar_url: value })
      .eq("id", user.id);
    if (dbError) {
      setError("Не удалось сохранить аватар. Попробуйте ещё раз.");
      return;
    }
    setAvatarUrl(value);
    setStatus(value ? "Аватар обновлён." : "Аватар удалён.");
  };

  const uploadAvatar = async (file: File) => {
    const invalid = validateLogoFile(file);
    if (invalid) {
      setError(invalid);
      setStatus(null);
      return;
    }
    try {
      const dataUrl = await fileToLogoDataUrl(file, 128);
      await saveAvatar(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обработать изображение.");
    }
  };

  const save = async () => {
    if (!user || !profileLoaded || !verification.data) return;
    setError(null);
    setStatus(null);
    setSaving(true);
    try {
      const result = await saveProfileForReview({
        nickname,
        bio,
        mmr,
        position,
        profileUrl,
        lookingForTeam,
      });
      qc.setQueryData(verificationQuery(user.id).queryKey, result);
      await qc.invalidateQueries({ queryKey: ["league"] });
      setStatus(
        result.status === "verified"
          ? "Профиль сохранён. Верификация сохранена."
          : "Профиль сохранён и отправлен на проверку модератору.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 lg:px-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> К турниру
      </Link>

      <h1 className="text-4xl leading-none text-foreground sm:text-5xl">Профиль игрока</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Расскажите о себе: никнейм, рейтинг MMR, позицию и пару слов для других участников лиги.
      </p>

      {loading ? (
        <p className="panel mt-6 p-5 text-sm text-muted-foreground">Загрузка…</p>
      ) : !user ? (
        <div className="panel mt-6 p-5">
          <p className="text-sm text-foreground">Чтобы заполнить профиль, войдите в аккаунт.</p>
          <Link
            to="/auth"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <UserIcon className="size-4" /> Войти
          </Link>
        </div>
      ) : (
        <div className="panel mt-6 space-y-4 p-5">
          <section
            className="rounded-lg border border-border bg-white/50 p-3"
            aria-label="Верификация профиля"
          >
            {verification.isPending ? (
              <p>Загрузка статуса…</p>
            ) : verification.isError ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {verification.error.message}
                </p>
                <button
                  className="mt-2 text-sm text-primary"
                  onClick={() => void verification.refetch()}
                >
                  Повторить
                </button>
              </>
            ) : (
              <>
                <p className="font-semibold text-primary">
                  {VERIFICATION_LABEL[verification.data.status]}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {verification.data.status === "verified"
                    ? "Изменение никнейма, MMR или ссылки потребует повторной проверки."
                    : verification.data.status === "pending"
                      ? "Профиль ожидает решения модератора или администратора."
                      : "Заполните никнейм, MMR и ссылку на игровой профиль, затем сохраните. Верификацию подтверждает модератор или администратор."}
                </p>
              </>
            )}
            {(ownRole.data === "admin" || ownRole.data === "moderator") && (
              <Link to="/admin" className="mt-2 inline-block text-sm text-primary underline">
                Проверка профилей участников
              </Link>
            )}
          </section>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <TeamLogo
              name={nickname || user.email || "?"}
              logo={avatarUrl ?? undefined}
              size="lg"
            />
            <div className="min-w-0 flex-1 break-words">
              <p className="text-sm font-bold text-foreground">{nickname || "Без ника"}</p>
              {discord ? (
                <p className="text-xs text-muted-foreground">
                  Discord: {discord.name || discord.username} (@{discord.username}) · ID{" "}
                  {discord.id}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
              <button
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth", replace: true });
                }}
                className="mt-1 text-xs font-semibold text-destructive hover:underline"
              >
                Выйти
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary">
                  <ImagePlus className="size-4" />{" "}
                  {avatarUrl ? "Заменить аватар" : "Загрузить аватар"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadAvatar(file);
                    }}
                  />
                </label>
                {avatarUrl && (
                  <button
                    onClick={() => void saveAvatar(null)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="nick">
              Никнейм
            </label>
            <input
              id="nick"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={32}
              placeholder="Например: Dendi"
              className={field}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="mmr">
                Рейтинг (MMR)
              </label>
              <input
                id="mmr"
                required
                inputMode="numeric"
                value={mmr}
                onChange={(e) => setMmr(e.target.value.replace(/\D/g, ""))}
                placeholder="4200"
                className={field}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="pos">
                Основная роль
              </label>
              <select
                id="pos"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className={field}
              >
                <option value="">Не выбрана</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="url">
              Ссылка на профиль (Steam / Dotabuff)
            </label>
            <input
              id="url"
              type="url"
              required
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.dotabuff.com/players/..."
              className={field}
            />
          </div>

          <section
            aria-labelledby="profile-team-label"
            className="rounded-lg border border-border bg-white/50 p-3"
          >
            <h2 id="profile-team-label" className="text-sm font-semibold">
              Команда
            </h2>
            {teams.isPending ? (
              <p className="mt-1 text-sm">Загрузка команды…</p>
            ) : teams.isError ? (
              <button className="mt-1 text-sm text-primary" onClick={() => void teams.refetch()}>
                Не удалось загрузить команду. Повторить
              </button>
            ) : !teams.data.length ? (
              <p className="mt-1 text-sm text-muted-foreground">Вы пока не состоите в команде.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {teams.data.map((team) => (
                  <li key={team.id} className="break-words">
                    {team.name} [{team.tag}]{team.owner_id === user.id ? " · Капитан" : ""}
                  </li>
                ))}
              </ul>
            )}
            {(teams.data?.length ?? 0) > 1 && (
              <p className="mt-2 text-sm text-destructive">
                В данных найдено несколько команд. Обратитесь к администратору для уточнения
                состава.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Команда определяется автоматически по владению и принятому приглашению.{" "}
              <Link to="/my-team" className="text-primary underline">
                Моя команда
              </Link>
            </p>
          </section>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              checked={lookingForTeam}
              onChange={(e) => setLookingForTeam(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Ищу команду
          </label>

          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="bio">
              О себе
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Играю саппорта, ищу команду на еженедельные турниры…"
              className={field}
            />
            <p className="mt-1 text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
          {status && (
            <p role="status" className="text-sm font-semibold text-primary">
              {status}
            </p>
          )}

          <button
            onClick={save}
            disabled={saving || !profileLoaded || verification.isPending || verification.isError}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Save className="size-4" />{" "}
            {saving ? "Сохраняем…" : "Сохранить и отправить на проверку"}
          </button>

          <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <Trophy className="size-4 text-accent" /> TDL points начисляются автоматически за
            призовые места в турнирах.
          </p>
        </div>
      )}
    </main>
  );
}
