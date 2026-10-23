import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Lock, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { TeamLogo } from "@/components/TeamLogo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingPanel } from "@/components/league";
import { btnGhost } from "@/components/TournamentEditor";
import { formatLeagueDate, rpcErrorText } from "@/lib/league";
import { moderatorAssignmentsQuery, usersWithRolesQuery } from "@/lib/league-admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Админка — роли и доступы — TrueDotaLeague" },
      {
        name: "description",
        content: "Панель администратора TrueDotaLeague: роли участников и модераторы турниров.",
      },
      { property: "og:title", content: "Админка — роли и доступы — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Управление ролями участников лиги по Дота 2: админ, модератор, игрок.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type AppRole = "admin" | "moderator" | "user";
const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Админ",
  moderator: "Модератор",
  user: "Игрок",
};

function AdminPage() {
  const { isAdmin, checking, user } = useAdmin();
  const qc = useQueryClient();
  const users = useQuery({ ...usersWithRolesQuery(), enabled: isAdmin });
  const assignments = useQuery({ ...moderatorAssignmentsQuery(), enabled: isAdmin });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const setRole = async (id: string, role: AppRole) => {
    setBusy(id);
    const { error } = await supabase.rpc("set_user_role", { target: id, new_role: role });
    setBusy(null);
    if (error) return toast.error(rpcErrorText(error));
    toast.success(`Роль изменена: ${ROLE_LABEL[role]}`);
    qc.invalidateQueries({ queryKey: ["league"] });
  };

  if (checking)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <LoadingPanel text="Проверяем доступ…" />
      </div>
    );
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6">
          <h1 className="flex items-center gap-2 text-3xl text-foreground">
            <Lock className="size-6 text-accent" /> Только для админов
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Управление ролями доступно администраторам лиги.
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

  const nick = new Map((users.data ?? []).map((u) => [u.id, u.nickname]));
  const q = query.trim().toLowerCase();
  const filtered = (users.data ?? []).filter(
    (r) => !q || r.nickname.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex flex-1 items-center gap-2 text-4xl text-foreground">
          <UserCog className="size-7 text-primary" /> Роли и доступы
        </h1>
        <Link to="/admin/import" className={btnGhost}>
          <Download className="size-4" /> Импорт старых данных
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        У каждого аккаунта одна роль. Модератор ведёт только назначенные ему турниры; назначение — в
        форме турнира.
      </p>

      <div className="panel p-4">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-white/70 px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по никнейму или команде"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        {users.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Загружаем участников…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Участники не найдены.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white/60 p-3"
              >
                <TeamLogo name={row.nickname || "?"} logo={row.avatar_url ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/players/$playerId"
                    params={{ playerId: row.id }}
                    className="block truncate font-bold text-foreground hover:text-primary"
                  >
                    {row.nickname || "Без никнейма"}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.team_name || "Без команды"}
                  </p>
                </div>
                <Select
                  disabled={busy === row.id}
                  value={row.role}
                  onValueChange={(value) => void setRole(row.id, value as AppRole)}
                >
                  <SelectTrigger
                    aria-label={`Роль: ${row.nickname || "Без никнейма"}`}
                    className="h-11 w-full min-w-0 rounded-xl border-primary/20 bg-white/80 text-left font-semibold shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 focus:ring-2 focus:ring-primary/25 sm:w-44"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)] rounded-xl border-primary/20 bg-white/95 p-1 shadow-xl backdrop-blur-xl">
                    {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                      <SelectItem
                        key={r}
                        value={r}
                        className="min-h-10 rounded-lg focus:bg-primary/10 focus:text-primary"
                      >
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="panel p-4">
        <h2 className="mb-3 text-xl text-foreground">Модераторы турниров</h2>
        {(assignments.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Активных назначений нет.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {(assignments.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 rounded-lg bg-white/50 px-3 py-1.5">
                <span className="font-semibold">{nick.get(a.user_id) ?? "—"}</span>
                <span>→</span>
                <Link
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: a.tournament_id }}
                  className="text-primary hover:underline"
                >
                  {a.tournaments?.title ?? "Турнир"}
                </Link>
                <span className="text-xs text-muted-foreground">
                  с {formatLeagueDate(a.assigned_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
