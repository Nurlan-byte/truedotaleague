import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Lock, Search, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { TeamLogo } from "@/components/TeamLogo";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Админка — роли и доступы — TrueDotaLeague" },
      {
        name: "description",
        content:
          "Панель администратора TrueDotaLeague: выдача прав администратора и модератора участникам лиги.",
      },
      { property: "og:title", content: "Админка — роли и доступы — TrueDotaLeague" },
      {
        property: "og:description",
        content: "Управление ролями участников лиги по Дота 2: админ, модератор, игрок.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type AppRole = "admin" | "moderator" | "user";

type Row = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  team_name: string;
  roles: AppRole[];
};

const ROLES: { value: Exclude<AppRole, "user">; label: string; hint: string }[] = [
  { value: "admin", label: "Админ", hint: "Создание турниров, команды, роли" },
  { value: "moderator", label: "Модератор", hint: "Ведение матчей и результатов" },
];

function AdminPage() {
  const { isAdmin, checking, user } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, nickname, avatar_url, team_name")
        .order("nickname", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || rErr) toast.error("Не удалось загрузить участников");
    const byUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r.role as AppRole);
      byUser.set(r.user_id, list);
    });
    setRows(
      (profiles ?? []).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar_url: p.avatar_url,
        team_name: p.team_name,
        roles: byUser.get(p.id) ?? [],
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const toggleRole = async (row: Row, role: Exclude<AppRole, "user">) => {
    const has = row.roles.includes(role);
    if (has && role === "admin" && row.id === user?.id) {
      toast.error("Нельзя снять роль администратора с себя");
      return;
    }
    setBusy(`${row.id}:${role}`);
    const { error } = has
      ? await supabase.from("user_roles").delete().eq("user_id", row.id).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: row.id, role });
    setBusy(null);
    if (error) {
      toast.error(has ? "Не удалось снять роль" : "Не удалось выдать роль");
      return;
    }
    toast.success(
      `${has ? "Роль снята" : "Роль выдана"}: ${role === "admin" ? "Админ" : "Модератор"} — ${row.nickname || "участник"}`,
    );
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, roles: has ? r.roles.filter((x) => x !== role) : [...r.roles, role] }
          : r,
      ),
    );
  };

  if (checking) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="panel p-6 text-sm text-muted-foreground">Проверяем доступ…</div>
      </div>
    );
  }

  if (!isAdmin) {
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
  }

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return r.nickname.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <UserCog className="size-7 text-primary" /> Роли и доступы
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Выдавайте роль «Админ» для создания турниров и управления лигой, «Модератор» — для ведения
        матчей.
      </p>

      <div className="panel mt-6 p-4">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-white/70 px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по никнейму или команде"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

        {loading ? (
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
                    {row.roles.includes("admin") && (
                      <span className="ml-2 inline-flex items-center gap-1 font-bold text-primary">
                        <ShieldCheck className="size-3" /> админ
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {ROLES.map((r) => {
                    const active = row.roles.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        title={r.hint}
                        disabled={busy === `${row.id}:${r.value}`}
                        onClick={() => void toggleRole(row, r.value)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-white/70 text-muted-foreground hover:border-primary hover:text-primary"
                        }`}
                      >
                        {active ? `${r.label} ✓` : `Выдать ${r.label.toLowerCase()}`}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
