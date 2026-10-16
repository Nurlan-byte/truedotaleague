import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Check, History, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamLogo } from "@/components/TeamLogo";
import { useReasonDialog } from "@/components/ReasonDialog";
import { btnGhost, btnPrimary, field } from "@/components/TournamentEditor";
import type { TournamentDetail } from "@/lib/league-api";
import {
  APPLICATION_LABEL,
  formatLeagueDate,
  rpcErrorText,
  toViewModel,
  type TournamentStatus,
} from "@/lib/league";
import {
  AUDIT_LABEL,
  auditQuery,
  bracketPayload,
  changedFields,
  fromLeagueInput,
  groupsPayload,
  rosterChanged,
  toLeagueInput,
  tournamentApplicationsQuery,
  usersWithRolesQuery,
} from "@/lib/league-admin";
import { finalPlacements, groupPlacements, PLACE_POINTS, roundName } from "@/lib/tournament";

type Props = { t: TournamentDetail; isAdmin: boolean; isStaff: boolean; userId: string };

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel space-y-3 border-primary/30 p-5">
      <h2 className="text-xl text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function StaffPanel({ t, isAdmin, isStaff, userId }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { ask, dialog } = useReasonDialog();
  const [finishOpen, setFinishOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["league"] });

  const run = useMutation({
    mutationFn: async (fn: () => Promise<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Готово");
      refresh();
    },
    onError: (e) => toast.error(rpcErrorText(e)),
  });

  const status = (to: TournamentStatus, title: string, required: boolean, withReason = true) => async () => {
    const reason = withReason ? await ask({ title, required, confirmLabel: title }) : await ask({ title, withReason: false });
    if (reason === null) return;
    run.mutate(() => supabase.rpc("change_tournament_status", { p_id: t.id, p_new_status: to, p_reason: reason || undefined }));
  };

  const vm = toViewModel(t.tournament_participants, t.matches, t.groups);
  const hasGroupScores = t.matches.some((m) => m.stage === "group" && m.score_a !== null);
  const hasPlayoffScores = t.matches.some((m) => m.stage === "playoff" && m.score_a !== null);
  const [groupCount, setGroupCount] = useState(2);

  const generate = async (kind: "groups" | "bracket") => {
    if (vm.teams.length < 2) return toast.error("Нужно минимум 2 принятые команды");
    const hasScores = kind === "groups" ? hasGroupScores : hasPlayoffScores;
    const existing = t.matches.filter((m) => m.stage === (kind === "groups" ? "group" : "playoff")).length;
    if (existing > 0) {
      const ok = await ask({
        title: kind === "groups" ? "Пересоздать группы?" : "Пересоздать сетку?",
        withReason: false,
        confirmLabel: "Пересоздать и очистить",
        description: (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Будут удалены {existing} матч(ей) {kind === "groups" ? "группового этапа и сами группы" : "плей-офф"}.</li>
            {hasScores && <li className="font-semibold text-destructive">Будут стёрты все введённые результаты этого этапа.</li>}
            <li>Назначенное время матчей тоже будет сброшено.</li>
          </ul>
        ),
      });
      if (ok === null) return;
    }
    const payload =
      kind === "groups"
        ? groupsPayload(vm.teams, Math.max(1, Math.min(groupCount, Math.floor(vm.teams.length / 2))))
        : bracketPayload(vm.teams);
    run.mutate(() =>
      supabase.rpc("generate_structure", {
        p_tournament_id: t.id,
        p_kind: kind,
        p_payload: payload,
        p_confirm_reset: existing > 0,
      }),
    );
  };

  const s = t.status;
  return (
    <div className="space-y-5">
      {dialog}
      {isAdmin && (
        <Box title="Управление турниром">
          <div className="flex flex-wrap gap-2">
            <Link to="/tournaments/$tournamentId/edit" params={{ tournamentId: t.id }} className={btnGhost}>
              <Pencil className="size-4" /> Редактировать
            </Link>
            {s === "draft" && <button className={btnPrimary} onClick={status("announced", "Анонсировать", false, false)}>Анонсировать</button>}
            {s === "announced" && (
              <button className={btnPrimary} onClick={status("registration_open", "Открыть регистрацию", false, false)}>Открыть регистрацию</button>
            )}
            {s === "registration_open" && (
              <button className={btnPrimary} onClick={status("registration_closed", "Закрыть регистрацию", false)}>Закрыть регистрацию</button>
            )}
            {s === "registration_closed" && (
              <>
                <button className={btnPrimary} onClick={status("live", "Начать турнир", false, false)}>Начать турнир</button>
                <button className={btnGhost} onClick={status("registration_open", "Повторно открыть регистрацию", true)}>
                  Повторно открыть регистрацию
                </button>
              </>
            )}
            {s === "live" && <button className={btnPrimary} onClick={() => setFinishOpen(true)}>Завершить</button>}
            {s === "finished" && <button className={btnGhost} onClick={() => setFinishOpen(true)}>Исправить итоги</button>}
            {s !== "cancelled" && s !== "finished" && (
              <button className={btnGhost + " hover:border-destructive hover:text-destructive"} onClick={status("cancelled", "Отменить турнир", true)}>
                Отменить
              </button>
            )}
            {s === "draft" && (
              <button
                className={btnGhost + " hover:border-destructive hover:text-destructive"}
                onClick={async () => {
                  const ok = await ask({ title: "Удалить черновик навсегда?", withReason: false, confirmLabel: "Удалить" });
                  if (ok === null) return;
                  const { error } = await supabase.rpc("delete_draft_tournament", { p_id: t.id });
                  if (error) return toast.error(rpcErrorText(error));
                  toast.success("Черновик удалён");
                  refresh();
                  navigate({ to: "/tournaments" });
                }}
              >
                <Trash2 className="size-4" /> Удалить черновик
              </button>
            )}
          </div>
          {s !== "draft" && (
            <p className="text-xs text-muted-foreground">Опубликованные турниры не удаляются — их можно только отменить.</p>
          )}
        </Box>
      )}

      {isAdmin && s !== "finished" && s !== "cancelled" && (
        <Box title="Группы и сетка">
          <p className="text-sm text-muted-foreground">Строится из принятых команд ({vm.teams.length}).</p>
          <div className="flex flex-wrap items-center gap-2">
            {t.format === "groups_playoff" || t.format === "round_robin" ? (
              <>
                <input
                  type="number"
                  min={1}
                  className={field + " w-20"}
                  value={groupCount}
                  onChange={(e) => setGroupCount(Math.max(1, Number(e.target.value) || 1))}
                  aria-label="Количество групп"
                />
                <button className={btnGhost} onClick={() => generate("groups")}>Сформировать группы</button>
              </>
            ) : null}
            {t.format !== "round_robin" && <button className={btnGhost} onClick={() => generate("bracket")}>Сформировать сетку</button>}
          </div>
        </Box>
      )}

      {isStaff && t.matches.length > 0 && <StaffMatches t={t} isAdmin={isAdmin} />}
      {isStaff && <StaffApplications tournamentId={t.id} isAdmin={isAdmin} userId={userId} />}
      {isAdmin && <AuditHistory tournamentId={t.id} />}
      {isAdmin && <FinishDialog t={t} open={finishOpen} onOpenChange={setFinishOpen} />}
    </div>
  );
}

function StaffMatches({ t, isAdmin }: { t: TournamentDetail; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const name = new Map(t.tournament_participants.map((p) => [p.team_id, p.team_name]));
  const groupName = new Map(t.groups.map((g) => [g.id, g.name]));
  const totalRounds = Math.max(0, ...t.matches.filter((m) => m.stage === "playoff").map((m) => m.round));
  const list = [...t.matches].sort((a, b) =>
    a.stage === b.stage ? a.round - b.round || a.slot - b.slot : a.stage === "group" ? -1 : 1,
  );
  const [edit, setEdit] = useState<Record<string, { time?: string; a?: string; b?: string }>>({});

  const saveTime = async (id: string, value: string) => {
    const { error } = await supabase.rpc("set_match_schedule", { p_match_id: id, p_scheduled_at: fromLeagueInput(value) ?? undefined });
    if (error) return toast.error(rpcErrorText(error));
    toast.success("Время сохранено");
    qc.invalidateQueries({ queryKey: ["league"] });
  };

  const saveScore = async (m: (typeof list)[number], a: string, b: string) => {
    const sa = a === "" ? null : Number(a);
    const sb = b === "" ? null : Number(b);
    if ((sa === null) !== (sb === null) || (sa !== null && (!Number.isInteger(sa) || sa < 0 || !Number.isInteger(sb) || (sb as number) < 0)))
      return toast.error("Введите оба счёта — целые числа ≥ 0");
    let reason: string | null = "";
    if (m.score_a !== null) {
      reason = await ask({ title: "Исправление результата", required: true, description: "Укажите причину исправления счёта." });
      if (reason === null) return;
    }
    const { error } = await supabase.rpc("set_match_score", {
      p_match_id: m.id,
      p_score_a: sa as number,
      p_score_b: sb as number,
      p_reason: reason || undefined,
    });
    if (error) {
      if (error.message.includes("admin_required")) return toast.error("Решение передано администратору");
      return toast.error(rpcErrorText(error));
    }
    toast.success("Счёт сохранён");
    setEdit((e) => ({ ...e, [m.id]: {} }));
    qc.invalidateQueries({ queryKey: ["league"] });
  };

  return (
    <Box title="Матчи: время и счёт">
      {dialog}
      <p className="text-xs text-muted-foreground">
        Время — по UTC+5. {isAdmin ? "" : "Если изменение затрагивает уже сыгранные следующие матчи, решение принимает администратор."}
      </p>
      <ul className="space-y-2">
        {list.map((m) => {
          const e = edit[m.id] ?? {};
          const stage = m.stage === "group" ? (groupName.get(m.group_id ?? "") ?? "Группа") : roundName(m.round, totalRounds);
          const ready = m.team_a_id && m.team_b_id;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-xs font-semibold text-primary">{stage}</span>
              <span className="min-w-0 flex-1 truncate">
                {name.get(m.team_a_id ?? "") ?? "—"} vs {name.get(m.team_b_id ?? "") ?? "—"}
              </span>
              <input
                type="datetime-local"
                className={field + " w-auto"}
                value={e.time ?? toLeagueInput(m.scheduled_at)}
                onChange={(ev) => setEdit((x) => ({ ...x, [m.id]: { ...e, time: ev.target.value } }))}
              />
              {e.time !== undefined && (
                <button className="text-xs font-semibold text-primary" onClick={() => saveTime(m.id, e.time!)}>
                  Сохранить время
                </button>
              )}
              {ready && (
                <span className="flex items-center gap-1">
                  <input
                    inputMode="numeric"
                    className={field + " w-14 text-center"}
                    value={e.a ?? (m.score_a ?? "").toString()}
                    onChange={(ev) => setEdit((x) => ({ ...x, [m.id]: { ...e, a: ev.target.value.trim() } }))}
                  />
                  :
                  <input
                    inputMode="numeric"
                    className={field + " w-14 text-center"}
                    value={e.b ?? (m.score_b ?? "").toString()}
                    onChange={(ev) => setEdit((x) => ({ ...x, [m.id]: { ...e, b: ev.target.value.trim() } }))}
                  />
                  {(e.a !== undefined || e.b !== undefined) && (
                    <button
                      className="text-xs font-semibold text-primary"
                      onClick={() => saveScore(m, e.a ?? (m.score_a ?? "").toString(), e.b ?? (m.score_b ?? "").toString())}
                    >
                      Сохранить счёт
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

type Snap = { name?: string; tag?: string; logo_url?: string | null; members?: { nickname: string; role?: string; mmr?: number | null }[] };

function StaffApplications({ tournamentId, isAdmin, userId }: { tournamentId: string; isAdmin: boolean; userId: string }) {
  const qc = useQueryClient();
  const { ask, dialog } = useReasonDialog();
  const { data = [], isLoading } = useQuery(tournamentApplicationsQuery(tournamentId));
  const decide = async (id: string, accept: boolean) => {
    let reason: string | null = "";
    if (!accept) {
      reason = await ask({ title: "Отклонить заявку", required: true, confirmLabel: "Отклонить" });
      if (reason === null) return;
    }
    const { error } = await supabase.rpc("decide_application", { p_id: id, p_accept: accept, p_reason: reason || undefined });
    if (error) return toast.error(rpcErrorText(error));
    toast.success(accept ? "Заявка принята" : "Заявка отклонена");
    qc.invalidateQueries({ queryKey: ["league"] });
  };
  const order = { pending: 0, accepted: 1, rejected: 2, withdrawn: 3 } as const;
  const sorted = [...data].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <Box title={`Заявки (${data.length})`}>
      {dialog}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загружаем…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Заявок пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => {
            const s = (a.roster_snapshot ?? {}) as Snap;
            const team = a.teams;
            const own =
              !isAdmin &&
              !!team &&
              (team.owner_id === userId ||
                team.team_captains.some((c) => c.user_id === userId) ||
                team.team_members.some((m) => m.profile_id === userId));
            const changed = a.status !== "withdrawn" && a.status !== "rejected" && team && rosterChanged(a.roster_snapshot, team.team_members);
            return (
              <li key={a.id} className="rounded-lg bg-white/50 p-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <TeamLogo name={s.name ?? "?"} logo={s.logo_url ?? undefined} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {s.name} {s.tag && <span className="text-xs text-primary">[{s.tag}]</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {APPLICATION_LABEL[a.status]} · подана {formatLeagueDate(a.created_at)} · регламент{" "}
                      {a.regulation_version_id ? a.regulation_version_id.slice(0, 8) : "—"}
                      {a.reject_reason ? ` · причина: ${a.reject_reason}` : ""}
                    </p>
                  </div>
                  {a.status === "pending" &&
                    (own ? (
                      <span className="text-xs font-semibold text-muted-foreground">Это ваша команда — решение за другим сотрудником</span>
                    ) : (
                      <div className="flex gap-2">
                        <button className={btnPrimary + " px-3 py-1.5"} onClick={() => decide(a.id, true)}>
                          <Check className="size-4" /> Принять
                        </button>
                        <button className={btnGhost + " px-3 py-1.5"} onClick={() => decide(a.id, false)}>
                          <X className="size-4" /> Отклонить
                        </button>
                      </div>
                    ))}
                </div>
                {changed && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-accent">
                    <AlertTriangle className="size-3.5" /> Состав изменён — требуется повторное рассмотрение
                  </p>
                )}
                {s.members && s.members.length > 0 && (
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    Состав в заявке: {s.members.map((m) => `${m.nickname}${m.role ? ` (${m.role})` : ""}${m.mmr ? `, ${m.mmr} MMR` : ""}`).join("; ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Box>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: "название",
  starts_at: "начало",
  registration_opens_at: "открытие регистрации",
  registration_closes_at: "закрытие регистрации",
  mode: "онлайн/офлайн",
  venue_name: "площадка",
  venue_address: "адрес",
  prize_amount: "призовой фонд",
  prize_currency: "валюта",
  prize_tba: "приз объявляется позже",
  team_limit: "лимит команд",
  format: "формат",
  status: "статус",
  description: "описание",
  image_url: "изображение",
};

function AuditHistory({ tournamentId }: { tournamentId: string }) {
  const { data = [] } = useQuery(auditQuery(tournamentId));
  const users = useQuery(usersWithRolesQuery());
  const nick = new Map((users.data ?? []).map((u) => [u.id, u.nickname]));
  if (!data.length) return null;
  return (
    <Box title="История изменений">
      <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
        {data.map((e) => {
          const fields = e.entity === "tournaments" ? changedFields(e.before, e.after) : [];
          return (
            <li key={e.id} className="flex flex-wrap gap-x-2 rounded-lg bg-white/50 px-3 py-1.5">
              <History className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="text-xs text-muted-foreground">{formatLeagueDate(e.created_at)}</span>
              <span className="font-semibold text-foreground">{AUDIT_LABEL[e.action] ?? e.action}</span>
              {fields.length > 0 && <span className="text-muted-foreground">: {fields.map((f) => FIELD_LABEL[f] ?? f).join(", ")}</span>}
              {e.reason && <span className="text-muted-foreground">· причина: {e.reason}</span>}
              <span className="text-xs text-muted-foreground">· {nick.get(e.actor_id ?? "") ?? "система"}</span>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

/** Места из сетки/групп → id команд. Только команды, сыгравшие хотя бы один матч. */
function computePlacements(t: TournamentDetail): string[] {
  const vm = toViewModel(t.tournament_participants, t.matches, t.groups);
  const byName = (n: string) => vm.teams.find((x) => x.name === n)?.id;
  const ordered: string[] = [];
  for (const p of finalPlacements(vm.bracket, vm.teams)) {
    const id = byName(p.teamName);
    if (id && !ordered.includes(id)) ordered.push(id);
  }
  for (const p of groupPlacements(vm.groups, vm.groupMatches)) {
    const id = byName(p.teamName);
    if (id && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function FinishDialog({ t, open, onOpenChange }: { t: TournamentDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const initial = useMemo(() => {
    const cur = [...t.placements].sort((a, b) => a.place - b.place).map((p) => p.team_id);
    return cur.length ? cur : computePlacements(t);
  }, [t]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const list = order ?? initial;
  const name = new Map(t.tournament_participants.map((p) => [p.team_id, p]));
  const notIn = t.tournament_participants.filter((p) => !list.includes(p.team_id));
  const correction = t.status === "finished";
  const oldPoints = new Map(t.placements.map((p) => [p.team_id, p.points]));

  const move = (i: number, d: number) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const submit = async () => {
    if (list.length < 1) return toast.error("Добавьте хотя бы победителя");
    if (correction && !reason.trim()) return toast.error("Укажите причину исправления");
    setBusy(true);
    const { error } = await supabase.rpc("finish_tournament", {
      p_id: t.id,
      p_placements: list.map((team_id, i) => ({ team_id, place: i + 1 })),
      p_reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(rpcErrorText(error));
    toast.success(correction ? "Итоги исправлены" : "Турнир завершён");
    onOpenChange(false);
    setOrder(null);
    qc.invalidateQueries({ queryKey: ["league"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{correction ? "Исправить итоги" : "Завершить турнир"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Места рассчитаны по сетке и группам. Проверьте порядок. Очки TDL: 1 — 50, 2 — 25, 3 — 12, 4 — 6. Сетка, группы и расписание сохраняются.
        </p>
        <ol className="space-y-1.5">
          {list.map((id, i) => {
            const p = name.get(id);
            const now = PLACE_POINTS[i + 1] ?? 0;
            const was = oldPoints.get(id) ?? 0;
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg bg-white/60 px-2 py-1.5 text-sm">
                <span className="w-6 font-bold">{i + 1}</span>
                <TeamLogo name={p?.team_name ?? "?"} logo={p?.logo_url ?? undefined} />
                <span className="flex-1 truncate">{p?.team_name}</span>
                <span className="text-xs font-semibold">
                  +{now}
                  {correction && was !== now && <span className="text-accent"> (было {was})</span>}
                </span>
                <button aria-label="Выше" onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
                <button aria-label="Ниже" onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
                <button aria-label="Убрать" onClick={() => setOrder(list.filter((x) => x !== id))}><X className="size-4" /></button>
              </li>
            );
          })}
        </ol>
        {correction &&
          t.placements
            .filter((p) => !list.includes(p.team_id) && p.points > 0)
            .map((p) => (
              <p key={p.id} className="text-xs text-accent">{p.team_name}: −{p.points} (убирается из итогов)</p>
            ))}
        {notIn.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {notIn.map((p) => (
              <button key={p.team_id} className="rounded-full border border-border px-2 py-0.5 text-xs" onClick={() => setOrder([...list, p.team_id])}>
                + {p.team_name}
              </button>
            ))}
          </div>
        )}
        {correction && (
          <textarea className={field + " min-h-20"} placeholder="Причина исправления (обязательно)" value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={() => onOpenChange(false)}>Отмена</button>
          <button className={btnPrimary} disabled={busy} onClick={submit}>{correction ? "Сохранить исправление" : "Завершить турнир"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
