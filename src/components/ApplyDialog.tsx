import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { myTeamsQuery, regulationQuery } from "@/lib/league-api";
import { formatLeagueDate, rpcErrorText } from "@/lib/league";
import { teamSystemQuery } from "@/lib/team-invitations";
import { legacyMyTeamsQuery } from "@/lib/legacy-team-api";
import { applicationRoster } from "@/lib/application-roster";

type Props = {
  tournamentId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ApplyDialog({ tournamentId, title, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const system = useQuery(teamSystemQuery(user?.id));
  const modernTeams = useQuery({
    ...myTeamsQuery(user?.id),
    enabled: !!user && system.data === true,
  });
  const legacyTeams = useQuery({
    ...legacyMyTeamsQuery(user?.id),
    enabled: !!user && system.data === false,
  });
  const teams = system.data === true ? modernTeams : legacyTeams;
  const available = system.data === true && system.isSuccess && !system.isError;
  const ownedTeams = useMemo(
    () => teams.data?.filter((team) => team.owner_id === user?.id),
    [teams.data, user?.id],
  );
  const regulation = useQuery(regulationQuery());
  const [agreed, setAgreed] = useState(false);
  const selectedTeam = ownedTeams?.length === 1 ? ownedTeams[0] : undefined;
  const teamId = selectedTeam?.id;
  const roster = applicationRoster(selectedTeam?.team_members ?? []);
  // Один ключ на открытие формы: повторное нажатие не создаёт дубль.
  const idempotencyKey = useMemo(() => (open ? crypto.randomUUID() : ""), [open]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!available || teams.isError || teams.isFetching || system.isFetching || !teamId || ownedTeams?.length !== 1)
        throw new Error("Изменения заявок пока недоступны.");
      if (!roster.ready) throw new Error("minimum_five_main_players");
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

        {teams.isLoading || regulation.isLoading || (user && system.isPending) ? (
          <p className="text-sm text-muted-foreground">Загружаем…</p>
        ) : teams.isError || system.isError ? (
          <p className="text-sm text-muted-foreground">
            Не удалось проверить доступ к заявкам. Обновите страницу.
          </p>
        ) : !available ? (
          <p role="status" className="text-sm text-muted-foreground">
            Подача заявок пока недоступна: требуется обновление сервера. Команды сохранены.
          </p>
        ) : !ownedTeams?.length ? (
          <p className="text-sm text-muted-foreground">
            У вас нет собственной команды. Заявку подаёт только её создатель.{" "}
            <Link to="/my-team" className="font-semibold text-primary hover:underline">
              Создайте команду
            </Link>{" "}
            и вернитесь сюда.
          </p>
        ) : ownedTeams.length > 1 ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Найдено несколько ваших команд. Обратитесь к администратору для разрешения конфликта.
            Заявка недоступна; существующие команды сохранены.
          </p>
        ) : !regulation.data ? (
          <p className="text-sm text-muted-foreground">
            Регламент ещё не опубликован — подать заявку пока нельзя.
          </p>
        ) : (
          <div className="space-y-4">
            <section aria-label="Ваша команда" className="min-w-0 rounded-xl border border-primary/20 bg-white/80 p-3 text-sm">
              <p className="mb-1 font-semibold text-foreground">Ваша команда</p>
              <p className="break-words">{selectedTeam?.name}{selectedTeam?.tag && ` [${selectedTeam.tag}]`}</p>
            </section>
            <p role="status" className="text-sm text-muted-foreground">
              Основной состав: {roster.count}/5. Для заявки нужны пять разных зарегистрированных
              игроков в основных слотах. Приглашения без принятия и запасные не учитываются.
              {!roster.ready && " Дополните основной состав перед подачей заявки."}
            </p>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Я ознакомился с{" "}
                <Link
                  to="/regulations"
                  target="_blank"
                  className="font-semibold text-primary hover:underline"
                >
                  регламентом
                </Link>{" "}
                (опубликован {formatLeagueDate(regulation.data.published_at, false)}) и принимаю
                его.
              </span>
            </label>
            <button
              disabled={!agreed || !teamId || submit.isPending || !available || teams.isFetching || system.isFetching || !roster.ready}
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
