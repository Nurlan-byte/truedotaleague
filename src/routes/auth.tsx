import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { safeAuthReturn } from "@/lib/auth-return";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Вход через Discord — TrueDotaLeague" },
    { name: "description", content: "Вход и регистрация TrueDotaLeague через Discord." },
    { name: "referrer", content: "no-referrer" },
  ] }),
  component: AuthPage,
});

const DISCORD_ERRORS: Record<string, string> = {
  cancelled: "Вход через Discord отменён. Можно попробовать ещё раз.",
  oauth_error: "Discord вернул ошибку авторизации. Попробуйте ещё раз.",
  no_code: "Discord не передал код авторизации. Попробуйте войти снова.",
  bad_state: "Ссылка входа устарела. Начните вход через Discord заново.",
  invalid_code: "Код авторизации Discord недействителен или уже использован.",
  profile_failed: "Не удалось получить профиль Discord. Попробуйте позже.",
  user_failed: "Не удалось создать или найти аккаунт. Попробуйте ещё раз.",
  session_failed: "Не удалось создать сессию. Попробуйте снова.",
  not_configured: "Вход через Discord пока не настроен администратором лиги.",
};

export function AuthPage() {
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get("discord_error");
    if (code) setError(DISCORD_ERRORS[code] ?? "Не удалось войти через Discord.");
    if (!loading && session) window.location.replace(safeAuthReturn(query.get("next")));
  }, [loading, session]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> К турнирам
      </Link>
      <div className="panel p-6">
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-primary">TrueDotaLeague</p>
        <h1 className="mt-2 text-3xl text-foreground">Вход через Discord</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Войдите в Discord. Если вы здесь впервые, аккаунт лиги будет создан после подтверждения входа.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <button type="button" disabled={busy || loading} onClick={() => {
          setBusy(true);
          const next = safeAuthReturn(new URLSearchParams(window.location.search).get("next"));
          window.location.href = `/api/public/auth/discord/start?next=${encodeURIComponent(next)}`;
        }} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-3 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#4752c4] disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Войти через Discord
        </button>
      </div>
    </main>
  );
}
