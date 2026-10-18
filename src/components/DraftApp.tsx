import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { draftPublicationKey, useDraftPublication } from "@/hooks/use-draft-publication";
import { publishedDraftFromState } from "@/lib/draft-publication";
import {
  type Captain,
  type DraftState,
  type Player,
  ORG,
  TEAM_COLORS,
  availablePlayers,
  currentTurn,
  initialState,
  parseBulk,
  pick,
  resultsCsv,
  resultsText,
  rosterOf,
  skip,
  slotsPerTeam,
  uid,
  undo,
  validate,
} from "@/lib/draft";

const KEY = "draft-night-v1";

function usePersisted() {
  const [s, setS] = useState<DraftState>(initialState);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = { ...initialState(), ...JSON.parse(raw) } as DraftState;
        setS(v);
        if (v.phase === "live") setRestored(true);
      }
    } catch {
      // Ignore an unreadable local draft and start with a clean setup.
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(s));
  }, [s, ready]);
  return { s, setS, restored, dismissRestored: () => setRestored(false) };
}

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DraftApp() {
  const { s, setS, restored, dismissRestored } = usePersisted();
  const publication = useDraftPublication();
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: async () => {
      if (s.phase !== "done" || publication.isError || publication.isPending) {
        throw new Error("Публикация недоступна до загрузки текущей версии.");
      }
      const { error } = await supabase.rpc("publish_draft_result", {
        p_expected_version: publication.data?.version ?? 0,
        p_result: publishedDraftFromState(s),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: draftPublicationKey });
    },
  });
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const cur = currentTurn(s);
  const totalPicks = s.captains.length * slotsPerTeam(s);
  const madePicks = s.history.filter((h) => h.kind === "pick").length;
  const status =
    s.phase === "setup"
      ? "Настройка"
      : s.phase === "done"
        ? "Завершён"
        : s.paused
          ? "Пауза"
          : "В эфире";

  const exportCsv = () =>
    download(`${s.title || "draft"}.csv`, resultsCsv(s), "text/csv;charset=utf-8");
  const copyText = async () => {
    await navigator.clipboard.writeText(resultsText(s));
    flash("Результаты скопированы");
  };

  const reset = (keep: boolean) => {
    if (
      !confirm(
        keep
          ? "Начать новый драфт? Текущие результаты сохранятся в архиве."
          : "Сбросить драфт? Все пики будут удалены.",
      )
    )
      return;
    setS((p) => ({
      ...p,
      phase: "setup",
      paused: false,
      turn: 0,
      history: [],
      archive:
        keep && p.history.length
          ? [{ title: p.title, at: Date.now(), text: resultsText(p) }, ...p.archive].slice(0, 10)
          : p.archive,
    }));
  };

  // auto-finish when nothing left
  useEffect(() => {
    if (s.phase === "live" && !cur) setS((p) => ({ ...p, phase: "done" }));
  }, [s.phase, cur, setS]);

  return (
    <div className="min-h-screen">
      <p className="no-print border-b border-border bg-white/65 px-4 py-2 text-center text-xs text-muted-foreground">
        Драфт работает в этом браузере. Его результаты не меняют официальные составы и турниры лиги.
      </p>
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              TDL
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.22em] text-primary">
                {ORG}
              </div>
              <input
                className="mt-1 w-full min-w-0 bg-transparent font-display text-xl font-bold uppercase tracking-wide outline-none sm:text-2xl"
                value={s.title}
                onChange={(e) => setS((p) => ({ ...p, title: e.target.value }))}
                aria-label="Название турнира"
              />
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${s.phase === "live" && !s.paused ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {status}
            </span>
          </div>
          {s.phase !== "setup" && (
            <div className="flex flex-wrap gap-2">
              {s.phase === "live" && (
                <>
                  <button className="btn" onClick={() => setS(undo)} disabled={!s.history.length}>
                    ↶ Отменить пик
                  </button>
                  <button className="btn" onClick={() => setS(skip)} disabled={s.paused}>
                    Пропустить ход
                  </button>
                  <button
                    className="btn"
                    onClick={() => setS((p) => ({ ...p, paused: !p.paused }))}
                  >
                    {s.paused ? "▶ Продолжить" : "❚❚ Пауза"}
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      confirm("Завершить драфт?") && setS((p) => ({ ...p, phase: "done" }))
                    }
                  >
                    Завершить
                  </button>
                </>
              )}
              {s.phase === "done" && (
                <button className="btn" onClick={() => setS(undo)} disabled={!s.history.length}>
                  ↶ Отменить пик
                </button>
              )}
              <button className="btn" onClick={exportCsv}>
                Экспорт CSV
              </button>
              <button className="btn btn-danger" onClick={() => reset(false)}>
                Сбросить
              </button>
            </div>
          )}
        </div>
      </header>

      {restored && (
        <div className="no-print mx-auto mt-3 flex max-w-[1600px] items-center justify-between gap-3 px-4">
          <div className="panel flex w-full items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>Активный драфт восстановлен после перезагрузки.</span>
            <button className="btn" onClick={dismissRestored}>
              OK
            </button>
          </div>
        </div>
      )}

      {s.phase === "done" && (
        <div className="no-print mx-auto mt-4 max-w-[1600px] px-4">
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Публикация результата</p>
              <p className="text-sm text-muted-foreground">
                Зрители видят только опубликованные составы. Изменения в этом браузере сами не
                публикуются.
              </p>
              {publication.isError && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  Сервер публикации недоступен. Проверьте миграцию и повторите загрузку.
                </p>
              )}
              {publish.isError && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  Не удалось опубликовать: {publish.error.message}
                </p>
              )}
              {publish.isSuccess && (
                <p className="mt-1 text-sm text-primary" role="status">
                  Результат опубликован.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {publication.isError && (
                <button className="btn" onClick={() => publication.refetch()}>
                  Повторить загрузку
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={publication.isPending || publication.isError || publish.isPending}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? "Публикуем…" : "Опубликовать результат"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        {s.phase === "setup" && <Setup s={s} setS={setS} />}
        {s.phase === "live" && (
          <Live s={s} setS={setS} cur={cur} madePicks={madePicks} totalPicks={totalPicks} />
        )}
        {s.phase === "done" && (
          <section className="space-y-4">
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="label-xs">
                  {ORG} · Драфт завершён · {madePicks} пиков
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">Итоговые составы</h2>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <button className="btn" onClick={copyText}>
                  Копировать текст
                </button>
                <button className="btn" onClick={exportCsv}>
                  Скачать CSV
                </button>
                <button className="btn" onClick={() => window.print()}>
                  Печать
                </button>
                <button className="btn btn-primary" onClick={() => reset(true)}>
                  Новый драфт
                </button>
              </div>
            </div>
            <Teams s={s} setS={setS} activeId={null} />
            <History s={s} />
          </section>
        )}
      </main>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-slide rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

type SP = { s: DraftState; setS: React.Dispatch<React.SetStateAction<DraftState>> };

/* ---------------- SETUP ---------------- */
function Setup({ s, setS }: SP) {
  const [pName, setPName] = useState("");
  const [pNick, setPNick] = useState("");
  const [pRating, setPRating] = useState("");
  const [bulk, setBulk] = useState("");
  const [cName, setCName] = useState("");
  const [cNick, setCNick] = useState("");
  const [cTeam, setCTeam] = useState("");
  const errors = validate(s);

  const addPlayer = () => {
    if (!pName.trim()) return;
    const r = pRating.trim() ? Number(pRating) : undefined;
    setS((p) => ({
      ...p,
      players: [
        ...p.players,
        {
          id: uid(),
          name: pName.trim(),
          nick: pNick.trim() || undefined,
          rating: Number.isFinite(r) ? r : undefined,
        },
      ],
    }));
    setPName("");
    setPNick("");
    setPRating("");
  };
  const addCaptain = () => {
    if (!cName.trim()) return;
    setS((p) => ({
      ...p,
      captains: [
        ...p.captains,
        {
          id: uid(),
          name: cName.trim(),
          nick: cNick.trim() || undefined,
          team: cTeam.trim() || `Команда ${cName.trim()}`,
          color: TEAM_COLORS[p.captains.length % TEAM_COLORS.length]!,
        },
      ],
    }));
    setCName("");
    setCNick("");
    setCTeam("");
  };
  const updP = (id: string, patch: Partial<Player>) =>
    setS((p) => ({ ...p, players: p.players.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const updC = (id: string, patch: Partial<Captain>) =>
    setS((p) => ({
      ...p,
      captains: p.captains.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const move = (i: number, d: number) =>
    setS((p) => {
      const c = [...p.captains];
      const j = i + d;
      if (j < 0 || j >= c.length) return p;
      [c[i], c[j]] = [c[j]!, c[i]!];
      return { ...p, captains: c };
    });
  const shuffle = () =>
    setS((p) => {
      const c = [...p.captains];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [c[i], c[j]] = [c[j]!, c[i]!];
      }
      return { ...p, captains: c };
    });
  const slots = slotsPerTeam(s);
  const need = slots * s.captains.length;

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_1fr_360px]">
      {/* Captains */}
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="whitespace-nowrap text-xl font-bold">
            Капитаны · порядок <span className="text-primary">{s.captains.length}</span>
          </h2>
          <button className="btn" onClick={shuffle} disabled={s.captains.length < 2}>
            Перемешать
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="field"
            placeholder="Имя капитана"
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCaptain()}
          />
          <input
            className="field"
            placeholder="Никнейм"
            value={cNick}
            onChange={(e) => setCNick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCaptain()}
          />
          <input
            className="field"
            placeholder="Название команды"
            value={cTeam}
            onChange={(e) => setCTeam(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCaptain()}
          />
        </div>
        <button className="btn btn-primary mt-2 w-full" onClick={addCaptain}>
          + Добавить капитана
        </button>
        <ol className="mt-4 space-y-2">
          {s.captains.map((c, i) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
            >
              <span className="w-6 shrink-0 text-center font-display text-lg text-muted-foreground">
                {i + 1}
              </span>
              <input
                type="color"
                value={c.color}
                onChange={(e) => updC(c.id, { color: e.target.value })}
                className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent"
                aria-label="Цвет"
              />
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-3">
                <input
                  className="field py-1"
                  value={c.name}
                  onChange={(e) => updC(c.id, { name: e.target.value })}
                />
                <input
                  className="field py-1"
                  value={c.nick ?? ""}
                  placeholder="ник"
                  onChange={(e) => updC(c.id, { nick: e.target.value || undefined })}
                />
                <input
                  className="field py-1"
                  value={c.team}
                  onChange={(e) => updC(c.id, { team: e.target.value })}
                />
              </div>
              <div className="flex shrink-0 flex-col">
                <button
                  className="px-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => move(i, -1)}
                  aria-label="Выше"
                >
                  ▲
                </button>
                <button
                  className="px-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => move(i, 1)}
                  aria-label="Ниже"
                >
                  ▼
                </button>
              </div>
              <button
                className="shrink-0 px-1 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setS((p) => ({ ...p, captains: p.captains.filter((x) => x.id !== c.id) }))
                }
                aria-label="Удалить"
              >
                ✕
              </button>
            </li>
          ))}
          {!s.captains.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">Пока нет капитанов</p>
          )}
        </ol>
      </section>

      {/* Players */}
      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Игроки <span className="text-primary">{s.players.length}</span>
          </h2>
          {s.players.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={() =>
                confirm("Удалить всех игроков?") && setS((p) => ({ ...p, players: [] }))
              }
            >
              Очистить
            </button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_80px]">
          <input
            className="field"
            placeholder="Имя и фамилия"
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <input
            className="field"
            placeholder="Никнейм"
            value={pNick}
            onChange={(e) => setPNick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <input
            className="field"
            placeholder="Рейтинг"
            inputMode="decimal"
            value={pRating}
            onChange={(e) => setPRating(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
        </div>
        <button className="btn btn-primary mt-2 w-full" onClick={addPlayer}>
          + Добавить игрока
        </button>
        <details className="mt-3 rounded-md border border-border bg-background p-3">
          <summary className="cursor-pointer text-sm font-bold">Массовая вставка списка</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Один игрок на строку. Можно: «Имя; ник; рейтинг».
          </p>
          <textarea
            className="field mt-2 h-28 font-mono text-xs"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"Иван Петров\nАнна Смирнова; Ann; 85"}
          />
          <button
            className="btn mt-2 w-full"
            onClick={() => {
              const list = parseBulk(bulk);
              if (list.length) {
                setS((p) => ({ ...p, players: [...p.players, ...list] }));
                setBulk("");
              }
            }}
          >
            Добавить {parseBulk(bulk).length || ""} игроков
          </button>
        </details>
        <ul className="mt-3 max-h-[440px] space-y-1 overflow-auto pr-1">
          {s.players.map((pl, i) => (
            <li
              key={pl.id}
              className="grid min-w-[390px] grid-cols-[24px_minmax(0,2fr)_minmax(0,1fr)_60px_20px] items-center gap-1.5"
            >
              <span className="text-right text-xs text-muted-foreground">{i + 1}</span>
              <input
                className="field py-1"
                value={pl.name}
                onChange={(e) => updP(pl.id, { name: e.target.value })}
              />
              <input
                className="field py-1"
                value={pl.nick ?? ""}
                placeholder="ник"
                onChange={(e) => updP(pl.id, { nick: e.target.value || undefined })}
              />
              <input
                className="field py-1"
                value={pl.rating ?? ""}
                placeholder="—"
                inputMode="decimal"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = Number(v);
                  updP(pl.id, { rating: v && Number.isFinite(n) ? n : undefined });
                }}
              />
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setS((p) => ({ ...p, players: p.players.filter((x) => x.id !== pl.id) }))
                }
                aria-label="Удалить"
              >
                ✕
              </button>
            </li>
          ))}
          {!s.players.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">Пока нет игроков</p>
          )}
        </ul>
      </section>

      {/* Settings */}
      <aside className="space-y-4">
        <section className="panel space-y-4 p-4">
          <h2 className="text-xl font-bold">Формат</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, l: "Snake", d: "A→D, D→A" },
              { v: false, l: "Обычный", d: "A→D каждый раунд" },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setS((p) => ({ ...p, snake: o.v }))}
                className={`rounded-md border p-3 text-left transition ${s.snake === o.v ? "border-primary bg-primary/10" : "border-border bg-background hover:border-muted-foreground"}`}
              >
                <div className="font-display text-lg font-bold uppercase">{o.l}</div>
                <div className="text-xs text-muted-foreground">{o.d}</div>
              </button>
            ))}
          </div>
          <label className="block">
            <span className="label-xs">Игроков в команде (всего)</span>
            <div className="mt-1 flex items-center gap-2">
              <button
                className="btn"
                onClick={() => setS((p) => ({ ...p, teamSize: Math.max(1, p.teamSize - 1) }))}
              >
                −
              </button>
              <input
                className="field text-center font-display text-xl"
                type="number"
                min={1}
                value={s.teamSize}
                onChange={(e) =>
                  setS((p) => ({ ...p, teamSize: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
              <button
                className="btn"
                onClick={() => setS((p) => ({ ...p, teamSize: p.teamSize + 1 }))}
              >
                +
              </button>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={s.captainCounts}
              onChange={(e) => setS((p) => ({ ...p, captainCounts: e.target.checked }))}
            />
            Капитан входит в состав команды
          </label>
          <div className="rounded-md bg-background p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Пиков на команду</span>
              <b>{slots}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Нужно игроков</span>
              <b>{need}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">В пуле</span>
              <b className={s.players.length < need ? "text-accent" : "text-primary"}>
                {s.players.length}
              </b>
            </div>
            {s.players.length < need && s.players.length > 0 && (
              <p className="mt-2 text-xs text-accent">
                Игроков меньше, чем мест — драфт закончится, когда пул опустеет.
              </p>
            )}
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 text-xl font-bold">Предпросмотр</h2>
          {s.captains.length > 0 ? (
            <div className="space-y-1 text-xs">
              {[0, 1, 2].slice(0, Math.max(1, Math.min(3, slots))).map((r) => (
                <div key={r} className="flex gap-1.5">
                  <span className="w-10 shrink-0 text-muted-foreground">Р{r + 1}</span>
                  <span className="truncate">
                    {(s.snake && r % 2 ? [...s.captains].reverse() : s.captains)
                      .map((c) => c.team)
                      .join(" → ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Добавьте капитанов</p>
          )}
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
          <button
            className="btn btn-primary mt-4 w-full py-3 font-display text-lg uppercase tracking-wider"
            disabled={errors.length > 0}
            onClick={() =>
              setS((p) => ({ ...p, phase: "live", paused: false, turn: 0, history: [] }))
            }
          >
            Начать драфт →
          </button>
        </section>

        {s.archive.length > 0 && (
          <section className="panel p-4">
            <h2 className="mb-2 text-xl font-bold">Архив</h2>
            <ul className="space-y-2">
              {s.archive.map((a) => (
                <li key={a.at} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {a.title} · {new Date(a.at).toLocaleDateString("ru-RU")}
                  </span>
                  <button
                    className="btn shrink-0"
                    onClick={() => navigator.clipboard.writeText(a.text)}
                  >
                    Копировать
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

/* ---------------- LIVE ---------------- */
function Live({
  s,
  setS,
  cur,
  madePicks,
  totalPicks,
}: SP & { cur: ReturnType<typeof currentTurn>; madePicks: number; totalPicks: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"rating" | "name">("rating");
  const [minR, setMinR] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [showTaken, setShowTaken] = useState(false);
  const [last, setLast] = useState<{
    name: string;
    team: string;
    color: string;
    key: number;
  } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const avail = useMemo(() => availablePlayers(s), [s]);
  const availIds = useMemo(() => new Set(avail.map((p) => p.id)), [avail]);
  const hasRatings = s.players.some((p) => p.rating != null);
  const list = useMemo(() => {
    const src = showTaken ? s.players : avail;
    const mr = Number(minR);
    return src
      .filter((p) => (p.name + " " + (p.nick ?? "")).toLowerCase().includes(q.toLowerCase()))
      .filter((p) => !minR || (p.rating ?? -Infinity) >= mr)
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "ru")
          : (b.rating ?? -Infinity) - (a.rating ?? -Infinity) || a.name.localeCompare(b.name, "ru"),
      );
  }, [s.players, avail, q, minR, sort, showTaken]);

  useEffect(() => {
    if (sel && !availIds.has(sel)) setSel(null);
  }, [sel, availIds]);

  const selected = s.players.find((p) => p.id === sel);
  const confirmPick = () => {
    if (!selected || !cur) return;
    setS((p) => pick(p, selected.id));
    setLast({
      name: selected.name,
      team: cur.captain.team,
      color: cur.captain.color,
      key: Date.now(),
    });
    setSel(null);
    setQ("");
  };
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 1800);
    return () => clearTimeout(t);
  }, [last]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" && sel && !(e.target instanceof HTMLInputElement)) confirmPick();
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const n = s.captains.length;
  const upcoming = cur
    ? Array.from({ length: Math.min(n * 2, 8) }, (_, i) => {
        // simulate future turns without considering team fullness changes beyond current
        const t = cur.turn + i;
        const r = Math.floor(t / n);
        const idx = s.snake && r % 2 ? n - 1 - (t % n) : t % n;
        return { c: s.captains[idx]!, round: r + 1, key: t };
      })
    : [];
  const curRoster = cur ? rosterOf(s, cur.captain.id).length : 0;

  return (
    <div className="space-y-4">
      {/* On the clock */}
      {cur && (
        <section
          className="panel relative overflow-hidden p-5 glow"
          style={{ borderColor: cur.captain.color }}
        >
          <div
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ background: cur.captain.color }}
          />
          <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr_auto]">
            <div className="flex gap-6">
              <div>
                <div className="label-xs">Раунд</div>
                <div className="font-display text-5xl font-bold leading-none">{cur.round}</div>
              </div>
              <div>
                <div className="label-xs">Пик</div>
                <div className="font-display text-5xl font-bold leading-none text-primary">
                  #{madePicks + 1}
                </div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="label-xs">{s.paused ? "Драфт на паузе" : "Выбирает"}</div>
              <div
                className="truncate font-display text-3xl font-bold uppercase leading-tight sm:text-5xl"
                style={{ color: cur.captain.color }}
              >
                {cur.captain.team}
              </div>
              <div className="text-sm text-muted-foreground">
                Капитан {cur.captain.name}
                {cur.captain.nick ? ` «${cur.captain.nick}»` : ""} · в составе{" "}
                {curRoster + (s.captainCounts ? 1 : 0)}/{s.teamSize}
              </div>
            </div>
            <div className="text-right">
              <div className="label-xs">Выбрано / всего</div>
              <div className="font-display text-3xl font-bold">
                {madePicks}
                <span className="text-muted-foreground">/{totalPicks}</span>
              </div>
              <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${totalPicks ? (madePicks / totalPicks) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">в пуле {avail.length}</div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* Teams compact */}
        <aside className="panel order-2 p-3 lg:order-1">
          <h3 className="mb-2 text-lg font-bold">Команды</h3>
          <ul className="space-y-1.5">
            {s.captains.map((c) => {
              const cnt = rosterOf(s, c.id).length;
              const active = cur?.captain.id === c.id;
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md border p-2 transition ${active ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{c.team}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.name}</div>
                  </div>
                  <span className="shrink-0 font-display text-lg">
                    {cnt}
                    <span className="text-muted-foreground">/{slotsPerTeam(s)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Pool */}
        <section className="panel order-1 p-3 lg:order-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-lg font-bold">
              Пул игроков <span className="text-primary">{avail.length}</span>
            </h3>
            <input
              className="field w-44"
              placeholder="Поиск…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {hasRatings && (
              <input
                className="field w-24"
                placeholder="Рейтинг ≥"
                inputMode="decimal"
                value={minR}
                onChange={(e) => setMinR(e.target.value)}
              />
            )}
            <select
              className="field w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value as "rating" | "name")}
            >
              <option value="rating">По рейтингу</option>
              <option value="name">По имени</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showTaken}
                onChange={(e) => setShowTaken(e.target.checked)}
              />{" "}
              выбранные
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => {
              const taken = !availIds.has(p.id);
              const owner = taken
                ? s.captains.find(
                    (c) => c.id === s.history.find((h) => h.playerId === p.id)?.captainId,
                  )
                : undefined;
              const isSel = sel === p.id;
              return (
                <button
                  key={p.id}
                  disabled={taken || s.paused || !cur}
                  onClick={() => setSel(isSel ? null : p.id)}
                  className={`group relative min-w-0 rounded-md border p-2.5 text-left transition ${taken ? "border-border bg-background opacity-40" : isSel ? "border-primary bg-primary/15 glow" : "border-border bg-background hover:border-muted-foreground"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-bold ${taken ? "line-through" : ""}`}>
                        {p.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {owner ? owner.team : (p.nick ?? "\u00a0")}
                      </div>
                    </div>
                    {p.rating != null && (
                      <span className="shrink-0 rounded bg-secondary px-1.5 font-display text-base">
                        {p.rating}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {!list.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">Никого не найдено</p>
          )}
        </section>

        {/* Right: order + history */}
        <aside className="order-3 space-y-4">
          <section className="panel p-3">
            <h3 className="mb-2 text-lg font-bold">Очередь</h3>
            <ol className="space-y-1">
              {upcoming.map((u, i) => (
                <li
                  key={u.key}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${i === 0 ? "bg-primary text-primary-foreground font-bold" : ""}`}
                >
                  <span className="w-7 shrink-0 text-xs opacity-70">Р{u.round}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: u.c.color }}
                  />
                  <span className="truncate">{u.c.team}</span>
                </li>
              ))}
            </ol>
          </section>
          <History s={s} compact />
        </aside>
      </div>

      <Teams s={s} setS={setS} activeId={cur?.captain.id ?? null} />

      {/* Confirm bar */}
      {selected && cur && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-primary bg-card/95 backdrop-blur animate-slide">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="label-xs">
                Пик #{madePicks + 1} · {cur.captain.team}
              </div>
              <div className="truncate font-display text-2xl font-bold uppercase">
                {selected.name}
                {selected.rating != null && (
                  <span className="ml-2 text-primary">{selected.rating}</span>
                )}
              </div>
            </div>
            <button className="btn" onClick={() => setSel(null)}>
              Отмена
            </button>
            <button
              ref={confirmRef}
              className="btn btn-primary px-6 py-3 font-display text-lg uppercase tracking-wider"
              onClick={confirmPick}
            >
              Подтвердить пик ⏎
            </button>
          </div>
        </div>
      )}

      {/* Pick animation */}
      {last && (
        <div
          key={last.key}
          className="no-print pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/60"
        >
          <div
            className="animate-pick panel px-10 py-8 text-center"
            style={{ borderColor: last.color, boxShadow: `0 0 60px -10px ${last.color}` }}
          >
            <div className="label-xs">Выбор сделан</div>
            <div className="font-display text-4xl font-bold uppercase sm:text-6xl">{last.name}</div>
            <div className="mt-1 font-display text-xl uppercase" style={{ color: last.color }}>
              → {last.team}
            </div>
          </div>
        </div>
      )}
      {selected && <div className="h-20" />}
    </div>
  );
}

/* ---------------- TEAMS ---------------- */
function Teams({ s, setS, activeId }: SP & { activeId: string | null }) {
  const slots = slotsPerTeam(s);
  const upd = (id: string, patch: Partial<Captain>) =>
    setS((p) => ({
      ...p,
      captains: p.captains.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  return (
    <section>
      <h3 className="mb-2 text-lg font-bold">Составы</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {s.captains.map((c) => {
          const roster = rosterOf(s, c.id);
          return (
            <div key={c.id} className={`panel overflow-hidden ${activeId === c.id ? "glow" : ""}`}>
              <div
                className="flex items-center gap-2 border-b border-border p-3"
                style={{ borderTop: `4px solid ${c.color}` }}
              >
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => upd(c.id, { color: e.target.value })}
                  className="no-print h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent"
                  aria-label="Цвет команды"
                />
                <input
                  className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold uppercase outline-none"
                  value={c.team}
                  onChange={(e) => upd(c.id, { team: e.target.value })}
                  aria-label="Название команды"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {roster.length}/{slots} · осталось {Math.max(0, slots - roster.length)}
                </span>
              </div>
              <ol className="space-y-0.5 p-3 text-sm">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-5 text-xs">К</span>
                  <span className="truncate">
                    {c.name}
                    {c.nick ? ` «${c.nick}»` : ""}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-widest">
                    {s.captainCounts ? "капитан" : "вне состава"}
                  </span>
                </li>
                {roster.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 animate-slide">
                    <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="truncate font-medium">{p.name}</span>
                    {p.rating != null && (
                      <span className="ml-auto font-display text-muted-foreground">{p.rating}</span>
                    )}
                  </li>
                ))}
                {Array.from({ length: Math.max(0, slots - roster.length) }).map((_, i) => (
                  <li key={"e" + i} className="flex items-center gap-2 text-muted-foreground/40">
                    <span className="w-5 text-xs">{roster.length + i + 1}</span>
                    <span>—</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- HISTORY ---------------- */
function History({ s, compact }: { s: DraftState; compact?: boolean }) {
  const items = [...s.history].reverse();
  return (
    <section className="panel p-3">
      <h3 className="mb-2 text-lg font-bold">История пиков</h3>
      <ul className={`space-y-1 overflow-y-auto pr-1 ${compact ? "max-h-[360px]" : ""}`}>
        {items.map((h, i) => {
          const c = s.captains.find((x) => x.id === h.captainId);
          const p = s.players.find((x) => x.id === h.playerId);
          return (
            <li
              key={h.at + "-" + i}
              className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded bg-background px-2 py-1.5 text-sm animate-slide"
            >
              <span className="font-display text-primary">
                {h.kind === "pick" ? `#${h.pickNo}` : "—"}
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold">
                  {h.kind === "pick" ? (
                    p?.name
                  ) : (
                    <span className="text-muted-foreground">ход пропущен</span>
                  )}
                </div>
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c?.color }}
                  />
                  Р{h.round} · {c?.team}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">{fmtTime(h.at)}</span>
            </li>
          );
        })}
        {!items.length && (
          <p className="py-4 text-center text-sm text-muted-foreground">Пиков пока нет</p>
        )}
      </ul>
    </section>
  );
}
