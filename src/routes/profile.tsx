import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { user, loading } = useAuth();
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [mmr, setMmr] = useState("");
  const [position, setPosition] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState("");
  const [lookingForTeam, setLookingForTeam] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("profiles")
      .select("nickname, bio, mmr, role_position, profile_url, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setNickname(data.nickname ?? "");
        setBio(data.bio ?? "");
        setMmr(data.mmr === null || data.mmr === undefined ? "" : String(data.mmr));
        setPosition(data.role_position ?? "");
        setProfileUrl(data.profile_url ?? "");
        setAvatarUrl(data.avatar_url ?? null);
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
    if (!user) return;
    setError(null);
    setStatus(null);

    const nick = nickname.trim();
    if (nick.length < 2 || nick.length > 32) {
      setError("Никнейм должен быть от 2 до 32 символов.");
      return;
    }
    if (bio.trim().length > 500) {
      setError("Описание не может быть длиннее 500 символов.");
      return;
    }
    let mmrValue: number | null = null;
    if (mmr.trim() !== "") {
      const n = Number(mmr.trim());
      if (!Number.isInteger(n) || n < 0 || n > 15000) {
        setError("MMR должен быть целым числом от 0 до 15000.");
        return;
      }
      mmrValue = n;
    }
    const url = profileUrl.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      setError("Ссылка должна начинаться с http:// или https://");
      return;
    }

    setSaving(true);
    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        nickname: nick,
        bio: bio.trim(),
        mmr: mmrValue,
        role_position: position,
        profile_url: url,
      })
      .eq("id", user.id);
    setSaving(false);

    if (dbError) setError("Не удалось сохранить профиль. Попробуйте ещё раз.");
    else setStatus("Профиль сохранён.");
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
          <p className="text-sm text-foreground">
            Чтобы заполнить профиль, войдите в аккаунт.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <UserIcon className="size-4" /> Войти
          </Link>
        </div>
      ) : (
        <div className="panel mt-6 space-y-4 p-5">
          <div className="flex items-center gap-3">
            <TeamLogo name={nickname || user.email || "?"} logo={avatarUrl ?? undefined} size="lg" />
            <div>
              <p className="text-sm font-bold text-foreground">{nickname || "Без ника"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary">
                  <ImagePlus className="size-4" /> {avatarUrl ? "Заменить аватар" : "Загрузить аватар"}
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
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.dotabuff.com/players/..."
              className={field}
            />
          </div>

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

          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          {status && <p className="text-sm font-semibold text-primary">{status}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Save className="size-4" /> {saving ? "Сохраняем…" : "Сохранить профиль"}
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
