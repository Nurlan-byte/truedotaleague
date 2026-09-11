import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/discord")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Вход через Discord — TrueDotaLeague" },
      {
        name: "description",
        content: "Завершение входа через Discord в TrueDotaLeague: создаём сессию и возвращаем вас на сайт.",
      },
      { property: "og:title", content: "Вход через Discord — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Подтверждаем вход через Discord и открываем доступ к турнирам лиги.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiscordCallbackPage,
});

function DiscordCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    if (!tokenHash) {
      setError("Ссылка входа недействительна или устарела. Попробуйте войти снова.");
      return;
    }
    let active = true;
    void (async () => {
      const { error: err } = await supabase.auth.verifyOtp({
        type: "email",
        token_hash: tokenHash,
      });
      if (!active) return;
      if (err) {
        setError("Сессия истекла или ссылка уже использована. Войдите через Discord ещё раз.");
        return;
      }
      navigate({ to: "/", replace: true });
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="panel p-6 text-center">
        {error ? (
          <>
            <h1 className="text-2xl leading-none text-foreground">Не удалось войти</h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            <Link
              to="/auth"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
            >
              Вернуться к входу
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <h1 className="mt-3 text-2xl leading-none text-foreground">Завершаем вход…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Создаём сессию Discord.</p>
          </>
        )}
      </div>
    </main>
  );
}
