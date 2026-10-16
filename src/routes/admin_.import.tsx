import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/use-admin";
import { LoadingPanel } from "@/components/league";
import { btnPrimary } from "@/components/TournamentEditor";
import { rpcErrorText } from "@/lib/league";
import { legacyDate, readLegacy, type LegacyState } from "@/lib/league-admin";
import type { GroupMatch, Match, Team } from "@/lib/tournament";

export const Route = createFileRoute("/admin_/import")({
  head: () => ({
    meta: [
      { title: "Импорт старых данных — TrueDotaLeague" },
      { name: "description", content: "Перенос команд и турниров из старой версии сайта в базу лиги." },
      { property: "og:title", content: "Импорт старых данных — TrueDotaLeague" },
      { property: "og:description", content: "Раздел администраторов лиги." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportPage,
});

type Summary = { teams: number; created: string[]; skipped: string[]; errors: string[] };

function ImportPage() {
  const { isAdmin, checking } = useAdmin();
  const qc = useQueryClient();
  const [legacy, setLegacy] = useState<LegacyState | null | undefined>(undefined);
  const [useRoster, setUseRoster] = useState(true);
  const [useCurrent, setUseCurrent] = useState(false);
  const [history, setHistory] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => setLegacy(readLegacy()), []);

  if (checking || legacy === undefined) return <div className="mx-auto max-w-4xl px-4 py-8"><LoadingPanel /></div>;
  if (!isAdmin) return <div className="mx-auto max-w-4xl px-4 py-8"><LoadingPanel text="Раздел доступен только администраторам." /></div>;

  const roster = legacy?.roster ?? [];
  const current = legacy && (legacy.teams?.length ?? 0) > 0 ? legacy : null;
  const records = legacy?.history ?? [];

  const run = async () => {
    if (!legacy) return;
    if (!confirm("Импортировать выбранные данные в базу лиги?")) return;
    setBusy(true);
    const s: Summary = { teams: 0, created: [], skipped: [], errors: [] };
    const teamIds = new Map<string, string>(); // legacy key -> uuid
    const ensureTeam = async (key: string, p: { name: string; tag?: string; logo?: string; members?: { nickname: string; role?: string; mmr?: number | null }[] }) => {
      if (teamIds.has(key)) return teamIds.get(key)!;
      const { data, error } = await supabase.rpc("import_legacy_team", {
        p: { legacy_id: key, name: p.name, tag: p.tag ?? "", logo_url: p.logo ?? "", members: p.members ?? [] },
      });
      if (error) throw error;
      teamIds.set(key, data as string);
      s.teams++;
      return data as string;
    };
    const teamKey = (t: Team) => (t.rosterId ? `roster:${t.rosterId}` : `team:${t.id}`);
    const rosterById = new Map(roster.map((r) => [r.id, r]));
    const mapTeam = async (t: Team) => {
      const r = t.rosterId ? rosterById.get(t.rosterId) : undefined;
      return ensureTeam(teamKey(t), r ? { name: r.name, tag: r.tag, logo: r.logo, members: r.players } : { name: t.name, logo: t.logo });
    };
    const structure = async (teams: Team[], groups: Team[][] = [], gm: GroupMatch[] = [], bracket: Match[] = []) => {
      const ids = new Map<string, string>();
      for (const t of teams) ids.set(t.id, await mapTeam(t));
      const id = (x: string | null) => (x ? (ids.get(x) ?? null) : null);
      return {
        ids,
        team_ids: [...new Set(ids.values())],
        groups: groups.map((g, i) => ({ name: `Группа ${String.fromCharCode(65 + i)}`, team_ids: g.map((t) => ids.get(t.id)).filter(Boolean) })),
        group_matches: gm.filter((m) => id(m.teamA) && id(m.teamB)).map((m) => ({ group_idx: m.group, team_a_id: id(m.teamA), team_b_id: id(m.teamB), score_a: m.scoreA, score_b: m.scoreB })),
        bracket: bracket.map((m) => ({ round: m.round, slot: m.order, team_a_id: id(m.teamA), team_b_id: id(m.teamB), score_a: m.scoreA, score_b: m.scoreB })),
      };
    };

    try {
      if (useRoster) for (const r of roster) await ensureTeam(`roster:${r.id}`, { name: r.name, tag: r.tag, logo: r.logo, members: r.players });
      if (useCurrent && current) {
        const st = await structure(current.teams ?? [], current.groups, current.groupMatches, current.bracket);
        const legacyId = `current:${(current.teams ?? []).map((t) => t.id).sort().join(",")}`.slice(0, 300);
        const { data, error } = await supabase.rpc("import_legacy_tournament", {
          p: { legacy_id: legacyId, title: current.title ?? "Текущий турнир", finished: false, team_ids: st.team_ids, groups: st.groups, group_matches: st.group_matches, bracket: st.bracket },
        });
        if (error) s.errors.push(`${current.title}: ${rpcErrorText(error)}`);
        else ((data as { skipped: boolean }).skipped ? s.skipped : s.created).push(`${current.title} (черновик)`);
      }
      for (const rec of records.filter((r) => history[r.id])) {
        try {
          const teams = [...(rec.teams ?? [])];
          for (const p of rec.placements) {
            if (!teams.some((t) => t.name === p.teamName)) teams.push({ id: `hist-${p.teamName.toLowerCase()}`, name: p.teamName, logo: p.logo });
          }
          const st = await structure(teams, rec.groups, rec.groupMatches, rec.bracket);
          const placements = rec.placements
            .map((p) => ({ team_id: st.ids.get(teams.find((t) => t.name === p.teamName)!.id), place: p.place }))
            .filter((p) => p.team_id);
          const { data, error } = await supabase.rpc("import_legacy_tournament", {
            p: {
              legacy_id: `history:${rec.id}`,
              title: rec.title,
              starts_at: legacyDate(rec.date),
              finished: true,
              team_ids: st.team_ids,
              placements,
              groups: st.groups,
              group_matches: st.group_matches,
              bracket: st.bracket,
            },
          });
          if (error) throw error;
          ((data as { skipped: boolean }).skipped ? s.skipped : s.created).push(rec.title);
        } catch (e) {
          s.errors.push(`${rec.title}: ${rpcErrorText(e as { message?: string })}`);
        }
      }
    } catch (e) {
      s.errors.push(rpcErrorText(e as { message?: string }));
    }
    setBusy(false);
    setSummary(s);
    qc.invalidateQueries({ queryKey: ["league"] });
    toast.success("Импорт завершён");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Download className="size-7 text-primary" /> Импорт старых данных
      </h1>
      <p className="text-sm text-muted-foreground">
        Данные читаются только из этого браузера и не удаляются из него. Повторный импорт не создаёт дубликатов.
      </p>
      {!legacy ? (
        <LoadingPanel text="В этом браузере нет данных старой версии сайта." />
      ) : (
        <>
          <section className="panel space-y-2 p-5">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={useRoster} onChange={(e) => setUseRoster(e.target.checked)} /> Команды из «Моя команда» ({roster.length})
            </label>
            <p className="break-words text-xs text-muted-foreground">
              {roster.map((r) => `${r.name}${r.tag ? ` [${r.tag}]` : ""} — ${r.players?.length ?? 0} игр.`).join(" · ") || "нет"}
            </p>
            <p className="text-xs text-muted-foreground">Владельцем импортированных команд станет ваш аккаунт — передайте их капитанам позже.</p>
          </section>
          <section className="panel space-y-2 p-5">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" disabled={!current} checked={useCurrent} onChange={(e) => setUseCurrent(e.target.checked)} />
              Текущий турнир {current ? `«${current.title}»` : "— нет"} (импортируется как черновик)
            </label>
            {current && (
              <p className="text-xs text-muted-foreground">
                Команд: {current.teams?.length ?? 0} · групп: {current.groups?.length ?? 0} · матчей в группах: {current.groupMatches?.length ?? 0} · матчей плей-офф: {current.bracket?.length ?? 0} · заявок: {legacy.applications?.length ?? 0} (старые заявки не переносятся — капитаны подают новые)
              </p>
            )}
          </section>
          <section className="panel space-y-2 p-5">
            <h2 className="font-semibold">История ({records.length}) — импортируется как завершённые с местами и очками</h2>
            {records.map((r) => (
              <label key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="checkbox" checked={!!history[r.id]} onChange={(e) => setHistory({ ...history, [r.id]: e.target.checked })} />
                <span className="font-semibold">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {r.date} · мест: {r.placements.length} · победитель: {r.placements.find((p) => p.place === 1)?.teamName ?? "—"}
                </span>
              </label>
            ))}
          </section>
          <button className={btnPrimary} disabled={busy} onClick={run}>{busy ? "Импортируем…" : "Импортировать выбранное"}</button>
        </>
      )}
      {summary && (
        <section className="panel space-y-1 p-5 text-sm">
          <h2 className="text-xl">Результат</h2>
          <p>Команд обработано: {summary.teams}</p>
          <p>Создано турниров: {summary.created.length ? summary.created.join(", ") : "0"}</p>
          <p>Уже были импортированы: {summary.skipped.length ? summary.skipped.join(", ") : "0"}</p>
          {summary.errors.map((e) => <p key={e} className="text-destructive">{e}</p>)}
        </section>
      )}
      <Link to="/admin" className="inline-block text-sm font-semibold text-primary hover:underline">← В админку</Link>
    </div>
  );
}
