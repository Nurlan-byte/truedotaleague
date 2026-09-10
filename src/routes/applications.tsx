import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Inbox, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { TeamLogo } from "@/components/TeamLogo";
import { useAdmin } from "@/hooks/use-admin";
import { useTournamentState } from "@/hooks/use-tournament-state";

export const Route = createFileRoute("/applications")({
  head: () => ({
    meta: [
      { title: "Заявки на турнир — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Панель администратора: заявки команд на участие в турнире лиги по Dota 2 — принять или отклонить.",
      },
      { property: "og:title", content: "Заявки на турнир — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Рассмотрение заявок команд на участие в турнире лиги по Dota 2.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const { isAdmin, checking, user } = useAdmin();
  const { state, actions } = useTournamentState();

  if (checking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <div className="panel p-6 text-sm text-muted-foreground">Проверяем доступ…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <div className="panel p-6">
          <h1 className="flex items-center gap-2 text-3xl text-foreground">
            <Lock className="size-6 text-accent" /> Только для админов
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Заявки команд рассматривают администраторы лиги.
          </p>
          {!user && (
            <Link
              to="/auth"
              className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    );
  }

  const pending = state.applications.filter((a) => a.status === "pending");
  const handled = state.applications.filter((a) => a.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Inbox className="size-7 text-primary" /> Заявки на турнир ({pending.length})
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Заявки команд на участие в турнире{" "}
        <span className="font-semibold text-foreground">«{state.title}»</span>. Принятая заявка сразу
        добавляет команду в список участников.
      </p>

      <div className="panel mt-5 p-4">
        {pending.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            Новых заявок нет. Капитаны подают их в разделе «Моя команда».
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-white/50 px-3 py-2 text-sm"
              >
                <TeamLogo name={a.teamName} logo={a.logo} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {a.teamName}
                    {a.tag && (
                      <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                        [{a.tag}]
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Капитан: {a.ownerName || "участник"} · игроков: {a.playersCount} · подана{" "}
                    {a.submittedAt}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      actions.approveApplication(a.id);
                      toast.success(`Заявка принята: ${a.teamName}`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                  >
                    <Check className="size-4" /> Принять
                  </button>
                  <button
                    onClick={() => {
                      const note = prompt(`Причина отказа для «${a.teamName}» (необязательно)`);
                      if (note === null) return;
                      actions.rejectApplication(a.id, note);
                      toast.success(`Заявка отклонена: ${a.teamName}`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/60 px-3 py-2 text-xs font-bold text-muted-foreground hover:border-destructive hover:text-destructive"
                  >
                    <X className="size-4" /> Отклонить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {handled.length > 0 && (
        <div className="panel mt-5 p-4">
          <h2 className="px-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Рассмотренные заявки
          </h2>
          <ul className="mt-2 space-y-1.5">
            {handled.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg bg-white/40 px-3 py-2 text-sm"
              >
                <TeamLogo name={a.teamName} logo={a.logo} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {a.teamName}
                  {a.note && (
                    <span className="ml-2 text-xs text-muted-foreground">— {a.note}</span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-[11px] font-bold uppercase tracking-wider ${
                    a.status === "approved" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {a.status === "approved" ? "принята" : "отклонена"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
