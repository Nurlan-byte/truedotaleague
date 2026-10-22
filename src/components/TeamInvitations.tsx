import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invitationsQuery, teamRpc, type Player } from "@/lib/team-invitations";

const button =
  "rounded-lg border border-border bg-white/70 px-3 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50";
export function TeamInvitations({
  userId,
  teamId,
  canAccept = true,
}: {
  userId: string;
  teamId?: string;
  canAccept?: boolean;
}) {
  const qc = useQueryClient();
  const query = useQuery(invitationsQuery(userId));
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "accept_invite" | "decline_invite" | "cancel_invite";
    }) => teamRpc(action, { p_invite_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league"] }),
    onError: (error) => toast.error(error.message),
  });
  const rows = (query.data ?? []).filter((row) =>
    teamId ? row.team_id === teamId : row.invited_user_id === userId,
  );
  return (
    <section
      className="mt-5 space-y-3 rounded-xl border border-border bg-white/40 p-4"
      aria-label={teamId ? "Отправленные приглашения" : "Входящие приглашения"}
    >
      <h2 className="text-lg font-semibold">
        {teamId ? "Отправленные приглашения" : "Приглашения в команду"}
      </h2>
      {!teamId && !canAccept && (
        <p className="text-xs text-muted-foreground">
          Принять приглашение можно, только если вы не состоите в другой команде и не владеете ею.
        </p>
      )}
      {query.isPending ? (
        <p className="text-sm">Загрузка…</p>
      ) : query.isError ? (
        <button className={button} onClick={() => void query.refetch()}>
          Не удалось загрузить. Повторить
        </button>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">Пока нет приглашений.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1 basis-full break-words sm:basis-auto">
                <p className="font-semibold">
                  {teamId ? row.invited_user_name : `${row.team_name} [${row.team_tag}]`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {
                    {
                      pending: "Ожидает ответа",
                      accepted: "Принято",
                      declined: "Отклонено",
                      cancelled: "Отменено",
                    }[row.status]
                  }
                </p>
              </div>
              {row.status === "pending" &&
                (teamId ? (
                  <button
                    className={button}
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: row.id, action: "cancel_invite" })}
                  >
                    Отменить
                  </button>
                ) : (
                  <>
                    <button
                      className={button}
                      disabled={mutation.isPending || !canAccept}
                      onClick={() => mutation.mutate({ id: row.id, action: "accept_invite" })}
                    >
                      Принять
                    </button>
                    <button
                      className={button}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: row.id, action: "decline_invite" })}
                    >
                      Отклонить
                    </button>
                  </>
                ))}
            </li>
          ))}
        </ul>
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
    queryKey: ["league", "team-player-search", teamId, search],
    enabled: !disabled && search.length >= 2,
    queryFn: () => teamRpc<Player[]>("search_team_players", { p_team_id: teamId, p_query: search }),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (disabled || !selected) throw new Error("Выберите доступного игрока.");
      if (
        selected.already_in_team ||
        players.data?.find((player) => player.id === selected.id)?.already_in_team
      )
        throw new Error("Игрок уже в команде. Приглашение недоступно.");
      return teamRpc("invite_player", { p_team_id: teamId, p_user_id: selected.id });
    },
    onSuccess: () => {
      setText("");
      setSelected(null);
      toast.success("Приглашение отправлено");
      return qc.invalidateQueries({ queryKey: ["league"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">
        Пригласить игрока
        <input
          className="mt-2 block w-full min-w-0 rounded-lg border border-input bg-white/70 px-3 py-2"
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            setSelected(null);
          }}
          placeholder="Ник на сайте — минимум 2 символа"
        />
      </label>
      {!disabled && search.length >= 2 && search === text.trim() && !selected && (
        <ul className="space-y-1" aria-label="Найденные игроки">
          {players.isPending ? (
            <li>Поиск…</li>
          ) : players.isError ? (
            <li>
              <button className={button} onClick={() => void players.refetch()}>
                Ошибка поиска. Повторить
              </button>
            </li>
          ) : players.data?.length ? (
            players.data.map((player) => (
              <li key={player.id}>
                <button
                  className={`${button} w-full break-words text-left`}
                  disabled={player.already_in_team === true}
                  onClick={() => {
                    if (player.already_in_team) return;
                    setSelected(player);
                    setText(player.nickname);
                  }}
                >
                  {player.nickname} · {player.mmr ?? "—"} MMR{" "}
                  <span className="text-xs text-muted-foreground">({player.id.slice(0, 8)})</span>
                  {player.already_in_team && <span className="ml-2 text-xs">Уже в команде</span>}
                </button>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">Свободные игроки не найдены.</li>
          )}
        </ul>
      )}
      {selected && (
        <p className="text-sm">
          Выбран: {selected.nickname} · {selected.mmr ?? "—"} MMR
        </p>
      )}
      <button
        className={button}
        disabled={
          disabled ||
          mutation.isPending ||
          !selected ||
          selected.already_in_team === true ||
          players.data?.some(
            (player) => player.id === selected?.id && player.already_in_team === true,
          )
        }
        onClick={() => mutation.mutate()}
      >
        Пригласить
      </button>
      <p className="text-xs text-muted-foreground">
        Игрок появится в составе после принятия. MMR всегда берётся из его профиля.
      </p>
    </section>
  );
}
