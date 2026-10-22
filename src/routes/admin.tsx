import {
  decideProfileReview,
  ownRoleQuery,
  profileReviewsQuery,
  type ProfileReview,
} from "@/lib/profile-api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Lock, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { TeamLogo } from "@/components/TeamLogo";
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
  const role = useQuery(ownRoleQuery(user?.id));
  const canReview = isAdmin || role.data === "moderator";
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

  if (checking || (!!user && role.isPending))
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <LoadingPanel text="Проверяем доступ…" />
      </div>
    );
  if (canReview && !isAdmin)
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <h1 className="text-3xl">Проверка профилей</h1>
        <ProfileReviewPanel userId={user!.id} />
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

      <ProfileReviewPanel userId={user!.id} />

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
                <select
                  aria-label="Роль"
                  disabled={busy === row.id}
                  value={row.role}
                  onChange={(e) => void setRole(row.id, e.target.value as AppRole)}
                  className="rounded-lg border border-input bg-white/70 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
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

function ProfileReviewPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const reviews = useQuery(profileReviewsQuery(true, userId));
  const decision = useMutation({
    mutationFn: ({ review, approve }: { review: ProfileReview; approve: boolean }) =>
      decideProfileReview(review, approve),
    onSuccess: async (_, { approve }) => {
      toast.success(approve ? "Профиль верифицирован" : "Профиль возвращён на заполнение");
      await qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => {
      toast.error(error.message);
      void reviews.refetch();
    },
  });
  return (
    <section className="panel space-y-3 p-4" aria-labelledby="profile-reviews-heading">
      <h2 id="profile-reviews-heading" className="text-xl">
        Профили на проверке
      </h2>
      {reviews.isPending ? (
        <p>Загрузка заявок…</p>
      ) : reviews.isError ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {reviews.error.message}
          </p>
          <button className={btnGhost} onClick={() => void reviews.refetch()}>
            Повторить
          </button>
        </>
      ) : !reviews.data.length ? (
        <p className="text-sm text-muted-foreground">Нет профилей, ожидающих проверки.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.data.map((review) => (
            <li
              key={review.profile_id}
              className="space-y-2 rounded-lg border border-border bg-white/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/players/$playerId"
                  params={{ playerId: review.profile_id }}
                  className="min-w-0 break-words font-semibold text-primary"
                >
                  {review.nickname}
                </Link>
                <span className="text-sm">{review.mmr} MMR</span>
              </div>
              <a
                href={review.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all text-sm text-primary underline"
              >
                {review.profile_url}
              </a>
              {review.role_position && <p className="text-sm">Позиция: {review.role_position}</p>}
              {review.bio && <p className="break-words text-sm">{review.bio}</p>}
              <p className="text-xs text-muted-foreground">
                Отправлен {formatLeagueDate(review.submitted_at)}
              </p>
              {review.profile_id === userId ? (
                <p className="text-sm text-muted-foreground">
                  Ваш профиль должен проверить другой модератор или администратор.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate({ review, approve: true })}
                  >
                    Подтвердить профиль
                  </button>
                  <button
                    className={btnGhost}
                    disabled={decision.isPending}
                    onClick={() => decision.mutate({ review, approve: false })}
                  >
                    Вернуть на заполнение
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
