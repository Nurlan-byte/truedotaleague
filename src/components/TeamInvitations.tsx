import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { invitationsQuery, teamRpc, type Player } from "@/lib/team-invitations";
const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
export function TeamInvitations({ userId, teamId }: { userId?: string; teamId?: string }) {
  const qc = useQueryClient();
  const query = useQuery(invitationsQuery(userId));
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      teamRpc("respond_team_invitation", { p_id: id, p_action: action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league"] }),
    onError: (e) => toast.error(e.message),
  });
  const rows = (query.data ?? []).filter((i) =>
    teamId ? i.team_id === teamId : i.invited_user_id === userId,
  );
  if (!userId) return null;
  return (
    <section id={teamId ? undefined : "invitations"} className="panel mt-5 space-y-3 p-5">
      <h2 className="font-semibold">{teamId ? "Отправленные приглашения" : "Приглашения"}</h2>
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.isError ? (
        <button onClick={() => void query.refetch()}>Не удалось загрузить. Повторить</button>
      ) : !rows.length ? (
        <p>Нет приглашений.</p>
      ) : (
        rows.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-2 rounded border p-3">
            <div className="min-w-0 flex-1 break-words">
              <p>
                {i.team_name} [{i.team_tag}]
              </p>
              <p className="text-sm">
                {teamId ? i.invited_user_name : `Пригласил: ${i.invited_by_name}`} ·{" "}
                {
                  (
                    {
                      pending: "Ожидает ответа",
                      accepted: "Принято",
                      declined: "Отклонено",
                      cancelled: "Отменено",
                    } as Record<string, string>
                  )[i.status]
                }
              </p>
            </div>
            {i.status === "pending" &&
              (teamId ? (
                <button
                  className={button}
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: i.id, action: "cancel" })}
                >
                  Отменить
                </button>
              ) : (
                <>
                  <button
                    className={button}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: i.id, action: "accept" })}
                  >
                    Принять
                  </button>
                  <button
                    className={button}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: i.id, action: "decline" })}
                  >
                    Отклонить
                  </button>
                </>
              ))}
          </div>
        ))
      )}
    </section>
  );
}
export function InvitePlayer({ teamId, disabled }: { teamId: string; disabled: boolean }) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const players = useQuery({
    queryKey: ["league", "player-search", teamId, search],
    enabled: search.length >= 2,
    queryFn: () => teamRpc<Player[]>("search_team_players", { p_team_id: teamId, p_query: search }),
  });
  const mutation = useMutation({
    mutationFn: () =>
      teamRpc("create_team_invitation", { p_team_id: teamId, p_user_id: selected!.id }),
    onSuccess: () => {
      setText("");
      setSelected(null);
      toast.success("Приглашение отправлено");
      return qc.invalidateQueries({ queryKey: ["league"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mt-4 space-y-2">
      <label className="block">
        Найти зарегистрированного игрока
        <input
          className="mt-2 block w-full min-w-0 rounded border p-2"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(null);
          }}
          placeholder="Минимум 2 символа ника"
        />
      </label>
      {search.length >= 2 && !selected && (
        <ul aria-label="Найденные игроки">
          {players.isPending ? (
            <li>Поиск…</li>
          ) : players.isError ? (
            <li>
              <button onClick={() => void players.refetch()}>Ошибка поиска. Повторить</button>
            </li>
          ) : players.data?.length ? (
            players.data.map((p) => (
              <li key={p.id}>
                <button
                  className={button}
                  onClick={() => {
                    setSelected(p);
                    setText(p.nickname);
                  }}
                >
                  {p.nickname} · {p.role_position || "Роль не указана"} · {p.mmr ?? "—"} MMR ·{" "}
                  {p.id.slice(0, 8)}
                </button>
              </li>
            ))
          ) : (
            <li>Свободные игроки не найдены</li>
          )}
        </ul>
      )}
      <button
        className={button}
        disabled={disabled || mutation.isPending || !selected}
        onClick={() => mutation.mutate()}
      >
        Пригласить
      </button>
    </div>
  );
}
