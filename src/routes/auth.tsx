import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход через Discord — TrueDotaLeague" },
      {
        name: "description",
        content: "Войдите в TrueDotaLeague через Discord, чтобы участвовать в турнирах и следить за рейтингом команд.",
      },
      { property: "og:title", content: "Вход через Discord — TrueDotaLeague" },
      { property: "og:description", content: "Вход в TrueDotaLeague через Discord. Турниры, сетки и TDL points." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const DISCORD_ERRORS: Record<string, string> = {
  cancelled: "Вход через Discord отменён.",
  oauth_error: "Discord вернул ошибку авторизации. Попробуйте ещё раз.",
  no_code: "Discord не передал код авторизации. Попробуйте войти снова.",
  bad_state: "Ссылка входа устарела. Начните вход через Discord заново.",
  invalid_code: "Код авторизации Discord недействителен или уже использован.",
  profile_failed: "Не удалось получить профиль Discord. Попробуйте позже.",
  user_failed: "Не удалось создать или найти аккаунт. Попробуйте ещё раз.",
  session_failed: "Не удалось создать сессию. Попробуйте войти снова.",
  not_configured: "Вход через Discord пока не настроен администратором лиги.",
};

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("discord_error");
    if (code) setError(DISCORD_ERRORS[code] ?? "Не удалось войти через Discord.");
  }, []);

  const discordLogin = () => {
    setError(null);
    setBusy(true);
    window.location.href = "/api/public/auth/discord/start";
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> К турнирам
      </Link>

      <div className="panel p-6">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-primary">TrueDotaLeague</p>
        <h1 className="mt-2 text-3xl leading-none text-foreground">Вход и регистрация</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Войдите через Discord — аккаунт создастся автоматически. Он нужен, чтобы участвовать в турнирах и попасть в рейтинг TDL points.
        </p>

        <button
          type="button"
          onClick={discordLogin}
          disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#5865F2] px-3 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <svg className="size-5" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
              <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.890 105.890 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.760 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.890 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
            </svg>
          )}
          Войти через Discord
        </button>

        {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}
      </div>
    </main>
  );
}
