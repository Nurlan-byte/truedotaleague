import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImagePlus, Save, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TournamentImage } from "@/components/league";
import { fileToLogoDataUrl } from "@/lib/image";
import { FORMAT_LABEL, LEAGUE_TZ_LABEL, rpcErrorText, type TournamentFormat, type TournamentRow } from "@/lib/league";
import {
  emptyForm,
  formFromRow,
  formToPayload,
  moderatorAssignmentsQuery,
  usersWithRolesQuery,
  validateForm,
  type TournamentForm,
} from "@/lib/league-admin";

export const field =
  "w-full min-w-0 rounded-lg border border-input bg-white/70 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white/70 px-4 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary disabled:opacity-50";

const FORMATS: TournamentFormat[] = ["single_elim", "groups_playoff", "round_robin"];
const draftKey = (id: string | undefined) => `tdl-tournament-draft:${id ?? "new"}`;

function Row({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs font-semibold text-destructive">{error}</span>}
    </label>
  );
}

export function TournamentEditor({ tournament }: { tournament?: TournamentRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<TournamentForm>(() => (tournament ? formFromRow(tournament) : emptyForm()));
  const [version, setVersion] = useState<number | undefined>(tournament?.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<TournamentRow | null>(null);
  const [restored, setRestored] = useState(false);
  const users = useQuery(usersWithRolesQuery());
  const assigned = useQuery({ ...moderatorAssignmentsQuery(tournament?.id), enabled: !!tournament });
  const [mods, setMods] = useState<string[] | null>(null);
  const moderators = (users.data ?? []).filter((u) => u.role === "moderator");
  const currentMods = useMemo(() => (assigned.data ?? []).map((a) => a.user_id), [assigned.data]);
  const selectedMods = mods ?? currentMods;

  // Восстановить неотправленный черновик формы
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(tournament?.id));
      if (raw) {
        setForm({ ...emptyForm(), ...(JSON.parse(raw) as TournamentForm) });
        setRestored(true);
      }
    } catch {
      /* ignore */
    }
  }, [tournament?.id]);

  const set = <K extends keyof TournamentForm>(k: K, v: TournamentForm[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      try {
        localStorage.setItem(draftKey(tournament?.id), JSON.stringify(next));
      } catch {
        /* квота — не критично */
      }
      return next;
    });
  };

  const published = tournament && tournament.status !== "draft";
  const startChanged = published && form.starts_at !== formFromRow(tournament).starts_at;

  const syncModerators = async (id: string) => {
    if (mods === null) return;
    const add = mods.filter((m) => !currentMods.includes(m));
    const remove = currentMods.filter((m) => !mods.includes(m));
    for (const u of add) {
      const { error } = await supabase.rpc("assign_moderator", { p_tournament_id: id, p_user_id: u });
      if (error) throw error;
    }
    for (const u of remove) {
      const { error } = await supabase.rpc("revoke_moderator", { p_tournament_id: id, p_user_id: u, p_reason: "Изменено в форме турнира" });
      if (error) throw error;
    }
  };

  const save = async (publish: boolean, force?: number) => {
    const errs = validateForm(form, publish);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Проверьте поля формы");
      return;
    }
    setBusy(true);
    try {
      const payload = { ...formToPayload(form), ...(tournament ? { id: tournament.id } : {}) };
      const { data, error } = await supabase.rpc("upsert_tournament", {
        payload,
        expected_version: tournament ? (force ?? version) : undefined,
      });
      if (error) {
        if (error.message.includes("version_conflict") && tournament) {
          const { data: latest } = await supabase.from("tournaments").select("*").eq("id", tournament.id).maybeSingle();
          setConflict(latest ?? null);
        }
        throw error;
      }
      const row = data as TournamentRow;
      setVersion(row.version);
      setConflict(null);
      await syncModerators(row.id);
      if (publish && row.status === "draft") {
        const { error: pe } = await supabase.rpc("change_tournament_status", { p_id: row.id, p_new_status: "announced" });
        if (pe) throw pe;
      }
      localStorage.removeItem(draftKey(tournament?.id));
      qc.invalidateQueries({ queryKey: ["league"] });
      toast.success(publish ? "Турнир опубликован" : "Черновик сохранён");
      navigate({ to: "/tournaments/$tournamentId", params: { tournamentId: row.id } });
    } catch (e) {
      toast.error(rpcErrorText(e as { message?: string }));
    } finally {
      setBusy(false);
    }
  };

  const conflictFields = conflict
    ? (Object.keys(form) as (keyof TournamentForm)[]).filter(
        (k) => JSON.stringify(formFromRow(conflict)[k]) !== JSON.stringify(form[k]),
      )
    : [];

  return (
    <div className="space-y-5">
      {restored && (
        <div className="panel flex flex-wrap items-center gap-2 p-3 text-sm text-foreground">
          Восстановлены несохранённые изменения формы.
          <button
            className="font-semibold text-primary hover:underline"
            onClick={() => {
              localStorage.removeItem(draftKey(tournament?.id));
              setForm(tournament ? formFromRow(tournament) : emptyForm());
              setRestored(false);
            }}
          >
            Сбросить
          </button>
        </div>
      )}
      {conflict && (
        <div className="panel border-destructive/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-destructive">
            <AlertTriangle className="size-4" /> Турнир изменён другим администратором
          </p>
          <p className="mt-1 text-muted-foreground">
            Поля, которые отличаются от вашей версии: {conflictFields.join(", ") || "нет отличий в полях формы"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={btnGhost}
              onClick={() => {
                setForm(formFromRow(conflict));
                setVersion(conflict.version);
                setConflict(null);
                localStorage.removeItem(draftKey(tournament?.id));
              }}
            >
              Загрузить актуальную версию
            </button>
            <button className={btnPrimary} disabled={busy} onClick={() => save(false, conflict.version)}>
              Сохранить мою версию поверх
            </button>
          </div>
        </div>
      )}

      <div className="panel space-y-4 p-5">
        <Row label="Название" error={errors.title}>
          <input className={field} value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
        </Row>
        <div className="flex flex-wrap items-center gap-4">
          <TournamentImage src={form.image_url || null} title={form.title || "Турнир"} className="size-28 rounded-xl text-3xl" />
          <div className="space-y-2">
            <label className={btnGhost + " cursor-pointer"}>
              <ImagePlus className="size-4" /> Логотип / обложка
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    set("image_url", await fileToLogoDataUrl(file, 512));
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            </label>
            {form.image_url && (
              <button className="block text-xs font-semibold text-destructive hover:underline" onClick={() => set("image_url", "")}>
                Убрать изображение
              </button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPG или WebP до 10 МБ, сжимается до 512×512.</p>
          </div>
        </div>
      </div>

      <div className="panel grid gap-4 p-5 sm:grid-cols-2">
        <Row label={`Начало ${LEAGUE_TZ_LABEL}`} error={errors.starts_at}>
          <input type="datetime-local" className={field} value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
        </Row>
        <Row label={`Закрытие регистрации ${LEAGUE_TZ_LABEL}`} error={errors.registration_closes_at} hint="Не позже начала турнира">
          <input
            type="datetime-local"
            className={field}
            value={form.registration_closes_at}
            onChange={(e) => set("registration_closes_at", e.target.value)}
          />
        </Row>
        <Row label={`Открытие регистрации ${LEAGUE_TZ_LABEL}`} error={errors.registration_opens_at}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.reg_manual} onChange={(e) => set("reg_manual", e.target.checked)} />
              Вручную (администратор откроет сам)
            </label>
            {!form.reg_manual && (
              <input
                type="datetime-local"
                className={field}
                value={form.registration_opens_at}
                onChange={(e) => set("registration_opens_at", e.target.value)}
              />
            )}
          </div>
        </Row>
        <Row label="Лимит команд" error={errors.team_limit}>
          <input type="number" min={2} step={1} className={field} value={form.team_limit} onChange={(e) => set("team_limit", e.target.value)} />
        </Row>
        {startChanged && (
          <p className="flex items-center gap-2 text-sm font-semibold text-accent sm:col-span-2">
            <AlertTriangle className="size-4" /> Дата начала изменена после публикации — перепроверьте срок закрытия регистрации.
          </p>
        )}
      </div>

      <div className="panel grid gap-4 p-5 sm:grid-cols-2">
        <Row label="Формат проведения">
          <select className={field} value={form.mode} onChange={(e) => set("mode", e.target.value as "online" | "offline")}>
            <option value="online">Онлайн</option>
            <option value="offline">Офлайн</option>
          </select>
        </Row>
        <Row label="Формат соревнования">
          <select className={field} value={form.format} onChange={(e) => set("format", e.target.value as TournamentFormat)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Row>
        {form.mode === "offline" && (
          <>
            <Row label="Площадка" error={errors.venue}>
              <input className={field} value={form.venue_name} onChange={(e) => set("venue_name", e.target.value)} />
            </Row>
            <Row label="Адрес">
              <input className={field} value={form.venue_address} onChange={(e) => set("venue_address", e.target.value)} />
            </Row>
          </>
        )}
        <Row label="Призовой фонд" error={errors.prize}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.prize_tba} onChange={(e) => set("prize_tba", e.target.checked)} />
              Будет объявлен
            </label>
            {!form.prize_tba && (
              <div className="flex gap-2">
                <input inputMode="decimal" className={field} placeholder="Сумма" value={form.prize_amount} onChange={(e) => set("prize_amount", e.target.value)} />
                <input className={field + " max-w-24"} placeholder="KZT" value={form.prize_currency} onChange={(e) => set("prize_currency", e.target.value)} />
              </div>
            )}
          </div>
        </Row>
      </div>

      <div className="panel space-y-4 p-5">
        <Row label="Описание" hint="Поддерживается простой markdown">
          <textarea className={field + " min-h-32"} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Row>
        <div>
          <p className="text-sm font-semibold text-foreground">Ответственные модераторы</p>
          {moderators.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Нет пользователей с ролью модератора. Выдайте роль в <Link to="/admin" className="text-primary hover:underline">админке</Link>.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {moderators.map((m) => {
                const on = selectedMods.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMods(on ? selectedMods.filter((x) => x !== m.id) : [...selectedMods, m.id])}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white/70 text-foreground"}`}
                  >
                    {m.nickname || "Без ника"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btnGhost} disabled={busy} onClick={() => save(false)}>
          <Save className="size-4" /> Сохранить {published ? "изменения" : "черновик"}
        </button>
        {!published && (
          <button className={btnPrimary} disabled={busy} onClick={() => save(true)}>
            <Send className="size-4" /> Опубликовать
          </button>
        )}
        <button
          className={btnGhost}
          disabled={busy}
          onClick={() =>
            tournament
              ? navigate({ to: "/tournaments/$tournamentId", params: { tournamentId: tournament.id } })
              : navigate({ to: "/tournaments" })
          }
        >
          <X className="size-4" /> Отмена
        </button>
      </div>
    </div>
  );
}
