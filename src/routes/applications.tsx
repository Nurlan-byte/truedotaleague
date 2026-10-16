import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { TeamLogo } from "@/components/TeamLogo";
import { LoadingPanel } from "@/components/league";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { pendingApplicationsQuery } from "@/lib/league-api";
import { APPLICATION_LABEL, formatLeagueDate, rpcErrorText } from "@/lib/league";

export const Route = createFileRoute("/applications")({
  head: () => ({
    meta: [
      { title: "Заявки на турниры — TrueDotaLeague" },
      { name: "description", content: "Рассмотрение заявок команд на участие в турнирах лиги." },
      { property: "og:title", content: "Заявки на турниры — TrueDotaLeague" },
      { property: "og:description", content: "Раздел администраторов: принятие и отклонение заявок команд." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApplicationsPage,
});

type Snapshot = { name?: string; tag?: string; logo_url?: string | null; members?: { nickname: string }[] };

function ApplicationsPage() {
  const { isAdmin, checking, user } = useAdmin();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ ...pendingApplicationsQuery(), enabled: isAdmin });

  const decide = useMutation({
    mutationFn: async (v: { id: string; accept: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("decide_application", {
        p_id: v.id,
        p_accept: v.accept,
        p_reason: v.reason ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.accept ? "Заявка принята" : "Заявка отклонена");
      qc.invalidateQueries({ queryKey: ["league"] });
    },
    onError: (e) => toast.error(rpcErrorText(e)),
  });

  if (checking) return <div className="mx-auto max-w-4xl px-4 py-8"><LoadingPanel /></div>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <LoadingPanel text="Раздел доступен только администраторам." />
        {!user && (
          <Link to="/auth" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Войти
          </Link>
        )}
      </div>
    );

  const pending = (data ?? []).filter((a) => a.status === "pending");
  const handled = (data ?? []).filter((a) => a.status !== "pending").slice(0, 30);

  const card = (a: (typeof pending)[number], actions: boolean) => {
    const s = (a.roster_snapshot ?? {}) as Snapshot;
    return (
      <li key={a.id} className="panel p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <TeamLogo name={s.name ?? "?"} logo={s.logo_url ?? undefined} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {s.name} {s.tag && <span className="text-xs text-primary">[{s.tag}]</span>}
            </p>
            <p className="break-words text-xs text-muted-foreground">
              {a.tournaments?.title} · подана {formatLeagueDate(a.created_at)} · игроков: {s.members?.length ?? 0}
            </p>
            {!actions && (
              <p className="text-xs text-muted-foreground">
                {APPLICATION_LABEL[a.status]}
                {a.reject_reason ? ` — ${a.reject_reason}` : ""}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex gap-2">
              <button
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: a.id, accept: true })}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="size-4" /> Принять
              </button>
              <button
                disabled={decide.isPending}
                onClick={() => {
                  const reason = prompt("Причина отказа (обязательно):")?.trim();
                  if (!reason) return toast.error("Укажите причину отказа");
                  decide.mutate({ id: a.id, accept: false, reason });
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/70 px-3 py-1.5 text-sm font-semibold text-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
              >
                <X className="size-4" /> Отклонить
              </button>
            </div>
          )}
        </div>
        {s.members && s.members.length > 0 && (
          <p className="mt-2 break-words text-xs text-muted-foreground">
            Состав: {s.members.map((m) => m.nickname).join(", ")}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Inbox className="size-7 text-primary" /> Заявки на турниры
      </h1>
      {isLoading ? (
        <div className="mt-5"><LoadingPanel /></div>
      ) : (
        <>
          <h2 className="mt-6 text-xl text-foreground">Ожидают решения ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="mt-3"><LoadingPanel text="Новых заявок нет." /></div>
          ) : (
            <ul className="mt-3 space-y-3">{pending.map((a) => card(a, true))}</ul>
          )}
          {handled.length > 0 && (
            <>
              <h2 className="mt-8 text-xl text-foreground">Рассмотренные</h2>
              <ul className="mt-3 space-y-3">{handled.map((a) => card(a, false))}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
