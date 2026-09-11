import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogIn, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход и регистрация — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Создайте аккаунт TrueDotaLeague по email или через Google, чтобы участвовать в турнирах и следить за рейтингом команд.",
      },
      { property: "og:title", content: "Вход и регистрация — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Регистрация в TrueDotaLeague: email или Google. Турниры, сетки и TDL points.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nickname: nickname.trim() || email.split("@")[0] },
          },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Мы отправили письмо для подтверждения. Проверьте почту и перейдите по ссылке.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "microsoft") => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(provider === "google" ? "Не удалось войти через Google" : "Не удалось войти через Microsoft");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
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
        <h1 className="mt-2 text-3xl leading-none text-foreground">
          {mode === "signup" ? "Регистрация аккаунта" : "Вход в аккаунт"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Аккаунт нужен, чтобы участвовать в турнирах и попасть в рейтинг TDL points.
        </p>

        <div className="mt-5 inline-flex w-full rounded-xl border border-border bg-white/70 p-1 backdrop-blur-sm">
          {(
            [
              ["signup", "Регистрация", UserPlus],
              ["login", "Вход", LogIn],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setError(null);
                setNotice(null);
              }}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                mode === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => oauth("google")}
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/80 px-3 py-2.5 text-sm font-bold text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.6z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.3 7.3 0 0 1-11-3.8H1v3.1A12 12 0 0 0 12 24z"
            />
            <path fill="#FBBC05" d="M5 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1a12 12 0 0 0 0 10.8l4-3.1z" />
            <path
              fill="#EA4335"
              d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
            />
          </svg>
          Продолжить с Google
        </button>

        <button
          type="button"
          onClick={() => oauth("microsoft")}
          disabled={busy}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/80 px-3 py-2.5 text-sm font-bold text-foreground backdrop-blur-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
            <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
            <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
            <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
          </svg>
          Продолжить с Microsoft
        </button>


        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> или email <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="nick" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Ник
              </label>
              <input
                id="nick"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Например, Dendi"
                className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
            />
          </div>
          <div>
            <label htmlFor="pass" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Пароль
            </label>
            <input
              id="pass"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary focus:bg-white"
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {notice && <p className="text-sm font-medium text-primary">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signup" ? "Создать аккаунт" : "Войти"}
          </button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          Можно войти через Google или Microsoft — email и пароль вводить не нужно.
        </p>
      </div>
    </main>
  );
}
