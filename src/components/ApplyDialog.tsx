import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { myTeamsQuery, regulationQuery } from "@/lib/league-api";
import { formatLeagueDate, rpcErrorText } from "@/lib/league";

type Props = {
  tournamentId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ApplyDialog({ tournamentId, title, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const teams = useQuery(myTeamsQuery(user?.id));
  const regulation = useQuery(regulationQuery());
  const [teamId, setTeamId] = useState("");
  const [agreed, setAgreed] = useState(false);
  // Один ключ на открытие формы: повторное нажатие не создаёт дубль.
  const idempotencyKey = useMemo(() => (open ? crypto.randomUUID() : ""), [open]);

  useEffect(() => {
    if (!teamId && teams.data?.[0]) setTeamId(teams.data[0].id);
  }, [teams.data, teamId]);

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_application", {
        p_tournament_id: tournamentId,
        p_team_id: teamId,
        p_regulation_version_id: regulation.data!.id,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Заявка отправлена — ожидайте решения администраторов");
      qc.invalidateQueries({ queryKey: ["league"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(rpcErrorText(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Заявка на турнир</DialogTitle>
          <DialogDescription className="break-words">«{title}»</DialogDescription>
        </DialogHeader>

        {teams.isLoading || regulation.isLoading ? (
          <p className="text-sm text-muted-foreground">Загружаем…</p>
        ) : !teams.data?.length ? (
          <p className="text-sm text-muted-foreground">
            У вас нет команды, где вы владелец или капитан.{" "}
            <Link to="/my-team" className="font-semibold text-primary hover:underline">
              Создайте команду
            </Link>{" "}
            и вернитесь сюда.
          </p>
        ) : !regulation.data ? (
          <p className="text-sm text-muted-foreground">
            Регламент ещё не опубликован — подать заявку пока нельзя.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-foreground">Команда</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground"
              >
                {teams.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · игроков: {t.team_members.length}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Я ознакомился с{" "}
                <Link to="/regulations" target="_blank" className="font-semibold text-primary hover:underline">
                  регламентом
                </Link>{" "}
                (опубликован {formatLeagueDate(regulation.data.published_at, false)}) и принимаю его.
              </span>
            </label>
            <button
              disabled={!agreed || !teamId || submit.isPending}
              onClick={() => submit.mutate()}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm disabled:opacity-50"
            >
              {submit.isPending ? "Отправляем…" : "Отправить заявку"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
